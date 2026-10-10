import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import { getPool } from '../database/pool.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import stockTransferRepository from '../repositories/stockTransferRepository.js';
import auditService from './auditService.js';

async function generateTransferNumber(connection) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ST-${dateStr}-`;
  const [rows] = await connection.query(
    'SELECT transfer_number FROM stock_transfers WHERE transfer_number LIKE ? ORDER BY id DESC LIMIT 1',
    [`${prefix}%`],
  );
  let nextSeq = 1;
  if (rows.length > 0) {
    const parts = rows[0].transfer_number.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

function assertUserCanAccessTransfer(userScope, transfer) {
  const hasAccess =
    userScope.orgIds.includes(Number(transfer.organization_id)) ||
    userScope.branchIds.includes(Number(transfer.source_branch_id)) ||
    userScope.branchIds.includes(Number(transfer.destination_branch_id)) ||
    userScope.warehouseIds.includes(Number(transfer.source_warehouse_id)) ||
    userScope.warehouseIds.includes(Number(transfer.destination_warehouse_id));

  if (!hasAccess) {
    throw new AppError('You do not have access to this stock transfer scope.', {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }
}

export const stockTransferService = {
  async listTransfers(query, user) {
    const scopeSets = await getScopeSets(user.id);
    return stockTransferRepository.listStockTransfers({
      organizationId: query.organizationId ? Number(query.organizationId) : undefined,
      sourceBranchId: query.sourceBranchId ? Number(query.sourceBranchId) : undefined,
      destinationBranchId: query.destinationBranchId ? Number(query.destinationBranchId) : undefined,
      sourceWarehouseId: query.sourceWarehouseId ? Number(query.sourceWarehouseId) : undefined,
      destinationWarehouseId: query.destinationWarehouseId ? Number(query.destinationWarehouseId) : undefined,
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
      accessibleOrgIds: scopeSets.orgIds,
      accessibleBranchIds: scopeSets.branchIds,
      accessibleWarehouseIds: scopeSets.warehouseIds,
    });
  },

  async getTransfer(id, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) {
      throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    }
    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);
    return transfer;
  },

  async getEligibleStock(warehouseId, productId, user) {
    const pool = getPool();
    const [whRows] = await pool.query(
      `SELECT w.*, b.organization_id 
       FROM warehouses w
       JOIN branches b ON b.id = w.branch_id
       WHERE w.id = ? LIMIT 1`,
      [warehouseId],
    );
    const wh = whRows[0];
    if (!wh) {
      throw new AppError('Warehouse not found', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });
    }

    const scopeSets = await getScopeSets(user.id);
    const hasAccess =
      scopeSets.orgIds.includes(Number(wh.organization_id)) ||
      scopeSets.branchIds.includes(Number(wh.branch_id)) ||
      scopeSets.warehouseIds.includes(Number(wh.id));
    if (!hasAccess) {
      throw new AppError('You do not have access to this warehouse.', { statusCode: 403, code: 'FORBIDDEN' });
    }

    return stockTransferRepository.getAvailableBatchesForWarehouse(warehouseId, productId);
  },

  async createTransfer(payload, user) {
    const organizationId = Number(payload.organizationId);
    const sourceBranchId = Number(payload.sourceBranchId);
    const sourceWarehouseId = Number(payload.sourceWarehouseId);
    const destinationBranchId = Number(payload.destinationBranchId);
    const destinationWarehouseId = Number(payload.destinationWarehouseId);

    const validationErrors = [];
    if (!organizationId) validationErrors.push({ field: 'organizationId', message: 'Organization is required' });
    if (!sourceBranchId) validationErrors.push({ field: 'sourceBranchId', message: 'Source branch is required' });
    if (!sourceWarehouseId) validationErrors.push({ field: 'sourceWarehouseId', message: 'Source warehouse is required' });
    if (!destinationBranchId) validationErrors.push({ field: 'destinationBranchId', message: 'Destination branch is required' });
    if (!destinationWarehouseId) validationErrors.push({ field: 'destinationWarehouseId', message: 'Destination warehouse is required' });

    if (sourceWarehouseId && destinationWarehouseId && sourceWarehouseId === destinationWarehouseId) {
      validationErrors.push({ field: 'destinationWarehouseId', message: 'Source and destination warehouses cannot be the same' });
    }

    if (!payload.lines || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      validationErrors.push({ field: 'lines', message: 'At least one product line is required' });
    }

    if (validationErrors.length > 0) {
      throw new ValidationError('Validation failed', validationErrors);
    }

    const pool = getPool();
    // Validate warehouses & branches
    const [sourceWhRows] = await pool.query('SELECT * FROM warehouses WHERE id = ? LIMIT 1', [sourceWarehouseId]);
    const sourceWh = sourceWhRows[0];
    if (!sourceWh) throw new AppError('Source warehouse not found', { statusCode: 404, code: 'SOURCE_WAREHOUSE_NOT_FOUND' });
    if (sourceWh.status !== 'active') throw new AppError('Source warehouse is inactive', { statusCode: 409, code: 'SOURCE_WAREHOUSE_INACTIVE' });
    if (sourceWh.branch_id !== sourceBranchId) throw new ValidationError('Validation failed', [{ field: 'sourceWarehouseId', message: 'Source warehouse does not belong to source branch' }]);

    const [destWhRows] = await pool.query('SELECT * FROM warehouses WHERE id = ? LIMIT 1', [destinationWarehouseId]);
    const destWh = destWhRows[0];
    if (!destWh) throw new AppError('Destination warehouse not found', { statusCode: 404, code: 'DESTINATION_WAREHOUSE_NOT_FOUND' });
    if (destWh.status !== 'active') throw new AppError('Destination warehouse is inactive', { statusCode: 409, code: 'DESTINATION_WAREHOUSE_INACTIVE' });
    if (destWh.branch_id !== destinationBranchId) throw new ValidationError('Validation failed', [{ field: 'destinationWarehouseId', message: 'Destination warehouse does not belong to destination branch' }]);

    // Inter-organization transfer check
    const [srcBranchRows] = await pool.query('SELECT * FROM branches WHERE id = ? LIMIT 1', [sourceBranchId]);
    const [dstBranchRows] = await pool.query('SELECT * FROM branches WHERE id = ? LIMIT 1', [destinationBranchId]);
    if (!srcBranchRows[0] || !dstBranchRows[0]) throw new AppError('Branch not found', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
    if (srcBranchRows[0].organization_id !== organizationId || dstBranchRows[0].organization_id !== organizationId) {
      throw new AppError('Inter-organization transfers are not permitted. Both branches must belong to the organization.', { statusCode: 400, code: 'INTER_ORGANIZATION_FORBIDDEN' });
    }

    // Verify user scope on source branch/warehouse or org
    const scopeSets = await getScopeSets(user.id);
    const canAccessSource =
      scopeSets.orgIds.includes(organizationId) ||
      scopeSets.branchIds.includes(sourceBranchId) ||
      scopeSets.warehouseIds.includes(sourceWarehouseId);
    if (!canAccessSource) {
      throw new AppError('You do not have permission to initiate transfers from the source branch/warehouse.', { statusCode: 403, code: 'FORBIDDEN' });
    }

    // Validate line items
    const lineErrors = [];
    const sanitizedLines = [];
    for (let i = 0; i < payload.lines.length; i++) {
      const l = payload.lines[i];
      const prodId = Number(l.productId);
      const unitId = Number(l.unitId);
      const qty = Number(l.quantityRequested);

      if (!prodId) lineErrors.push({ field: `lines[${i}].productId`, message: 'Product is required' });
      if (!unitId) lineErrors.push({ field: `lines[${i}].unitId`, message: 'Unit is required' });
      if (!Number.isFinite(qty) || qty <= 0) lineErrors.push({ field: `lines[${i}].quantityRequested`, message: 'Quantity must be positive' });

      sanitizedLines.push({
        productId: prodId,
        unitId,
        quantityRequested: qty,
        notes: l.notes,
      });
    }

    if (lineErrors.length > 0) {
      throw new ValidationError('Validation failed', lineErrors);
    }

    // Check products active and belong to org
    for (const l of sanitizedLines) {
      const [pRows] = await pool.query('SELECT id, organization_id, status FROM products WHERE id = ? LIMIT 1', [l.productId]);
      const product = pRows[0];
      if (!product) throw new AppError(`Product #${l.productId} does not exist`, { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
      if (product.organization_id !== organizationId) throw new ValidationError('Validation failed', [{ field: 'productId', message: 'Product belongs to another organization' }]);
      if (product.status !== 'active') throw new AppError(`Product #${l.productId} is inactive`, { statusCode: 409, code: 'PRODUCT_INACTIVE' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const transferNumber = await generateTransferNumber(connection);
      const transferId = await stockTransferRepository.createTransfer({
        organizationId,
        sourceBranchId,
        sourceWarehouseId,
        destinationBranchId,
        destinationWarehouseId,
        transferNumber,
        status: 'draft',
        reason: payload.reason,
        notes: payload.notes,
        requestedBy: user.id,
      }, connection);

      const transferLines = sanitizedLines.map((l) => ({
        ...l,
        transferId,
      }));
      await stockTransferRepository.createTransferLines(transferLines, connection);

      await connection.commit();
      return stockTransferRepository.findWithDetails(transferId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async updateTransfer(id, payload, user) {
    const transfer = await stockTransferRepository.findById(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'draft') {
      throw new AppError(`Cannot update transfer in '${transfer.status}' status. Only draft transfers can be edited.`, { statusCode: 409, code: 'TRANSFER_NOT_EDITABLE' });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await stockTransferRepository.updateTransfer(id, {
        reason: payload.reason !== undefined ? payload.reason : transfer.reason,
        notes: payload.notes !== undefined ? payload.notes : transfer.notes,
      }, connection);

      if (payload.lines && Array.isArray(payload.lines) && payload.lines.length > 0) {
        await stockTransferRepository.deleteTransferLines(id, connection);
        const newLines = payload.lines.map((l) => ({
          transferId: id,
          productId: Number(l.productId),
          unitId: Number(l.unitId),
          quantityRequested: Number(l.quantityRequested),
          notes: l.notes,
        }));
        await stockTransferRepository.createTransferLines(newLines, connection);
      }

      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async submitTransfer(id, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'draft') {
      throw new AppError(`Cannot submit transfer in '${transfer.status}' status. Only draft transfers can be submitted.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);

    if (!transfer.lines || transfer.lines.length === 0) {
      throw new AppError('Transfer must contain at least one line item before submitting.', { statusCode: 422, code: 'EMPTY_TRANSFER' });
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await stockTransferRepository.updateTransfer(id, { status: 'submitted' }, connection);
      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async approveTransfer(id, payload, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'submitted') {
      throw new AppError(`Cannot approve transfer in '${transfer.status}' status. Must be 'submitted'.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update approved quantities on lines
      for (const line of transfer.lines) {
        let approvedQty = Number(line.quantity_requested);
        if (payload.approvedLines && Array.isArray(payload.approvedLines)) {
          const match = payload.approvedLines.find((al) => al.lineId === line.id);
          if (match && Number.isFinite(Number(match.quantityApproved))) {
            approvedQty = Math.max(0, Number(match.quantityApproved));
          }
        }
        await stockTransferRepository.updateTransferLine(line.id, {
          quantity_approved: approvedQty,
        }, connection);
      }

      await stockTransferRepository.updateTransfer(id, {
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date(),
      }, connection);

      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async rejectTransfer(id, payload, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (!['draft', 'submitted'].includes(transfer.status)) {
      throw new AppError(`Cannot reject transfer in '${transfer.status}' status.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    if (!payload.rejectionReason || !payload.rejectionReason.trim()) {
      throw new ValidationError('Validation failed', [{ field: 'rejectionReason', message: 'Rejection reason is mandatory' }]);
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await stockTransferRepository.updateTransfer(id, {
        status: 'rejected',
        rejected_by: user.id,
        rejected_at: new Date(),
        rejection_reason: payload.rejectionReason.trim(),
      }, connection);
      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async dispatchTransfer(id, payload, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'approved') {
      throw new AppError(`Cannot dispatch transfer in '${transfer.status}' status. Transfer must be 'approved'.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    // Must have scope on source warehouse/branch
    const scopeSets = await getScopeSets(user.id);
    const canAccessSource =
      scopeSets.orgIds.includes(Number(transfer.organization_id)) ||
      scopeSets.branchIds.includes(Number(transfer.source_branch_id)) ||
      scopeSets.warehouseIds.includes(Number(transfer.source_warehouse_id));
    if (!canAccessSource) {
      throw new AppError('You do not have access to dispatch stock from the source warehouse.', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (!payload.allocations || !Array.isArray(payload.allocations) || payload.allocations.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'allocations', message: 'At least one batch allocation is required for dispatch' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validate allocations against transfer lines
      const lineMap = new Map(transfer.lines.map((l) => [l.id, l]));
      const allocationsByLine = new Map();
      const inventoryAllocations = [];

      for (let i = 0; i < payload.allocations.length; i++) {
        const alloc = payload.allocations[i];
        const line = lineMap.get(Number(alloc.transferLineId));
        if (!line) {
          throw new ValidationError('Validation failed', [{ field: `allocations[${i}].transferLineId`, message: 'Invalid transfer line ID' }]);
        }

        const qty = Number(alloc.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new ValidationError('Validation failed', [{ field: `allocations[${i}].quantity`, message: 'Allocation quantity must be positive' }]);
        }

        // Verify batch belongs to product and organization
        const [batchRows] = await connection.query(
          'SELECT id, organization_id, product_id, batch_number, expiry_date, status FROM batches WHERE id = ? LIMIT 1',
          [alloc.batchId],
        );
        const batch = batchRows[0];
        if (!batch) {
          throw new AppError(`Batch #${alloc.batchId} not found`, { statusCode: 404, code: 'BATCH_NOT_FOUND' });
        }
        if (batch.product_id !== line.product_id) {
          throw new AppError(`Batch ${batch.batch_number} does not belong to product #${line.product_id}`, { statusCode: 409, code: 'BATCH_MISMATCH' });
        }
        if (batch.status !== 'active') {
          throw new AppError(`Batch ${batch.batch_number} is inactive and cannot be dispatched`, { statusCode: 409, code: 'BATCH_INACTIVE' });
        }
        if (new Date(batch.expiry_date).getTime() <= Date.now()) {
          throw new AppError(`Batch ${batch.batch_number} is expired and cannot be dispatched`, { statusCode: 409, code: 'BATCH_EXPIRED' });
        }

        // Verify source storage location belongs to source warehouse
        const [locRows] = await connection.query(
          'SELECT id, warehouse_id, status FROM storage_locations WHERE id = ? LIMIT 1',
          [alloc.sourceStorageLocationId],
        );
        const loc = locRows[0];
        if (!loc || loc.warehouse_id !== transfer.source_warehouse_id) {
          throw new ValidationError('Validation failed', [{ field: `allocations[${i}].sourceStorageLocationId`, message: 'Storage location does not belong to source warehouse' }]);
        }

        const existingQty = allocationsByLine.get(line.id) || 0;
        allocationsByLine.set(line.id, existingQty + qty);

        inventoryAllocations.push({
          transferLineId: line.id,
          productId: line.product_id,
          unitId: line.unit_id,
          batchId: batch.id,
          batchNumber: batch.batch_number,
          sourceStorageLocationId: loc.id,
          quantity: qty,
          reason: `Transfer dispatch ${transfer.transfer_number}`,
        });
      }

      // Check for over-dispatch against approved quantities
      for (const [lineId, totalAllocated] of allocationsByLine.entries()) {
        const line = lineMap.get(lineId);
        const approvedQty = Number(line.quantity_approved);
        if (totalAllocated > approvedQty) {
          throw new AppError(
            `Total allocated quantity (${totalAllocated}) exceeds approved quantity (${approvedQty}) for line #${lineId}`,
            { statusCode: 409, code: 'OVER_DISPATCH_REJECTED' },
          );
        }
      }

      // Authoritative inventory mutation via inventoryService
      await inventoryService.dispatchStockTransfer({
        transferId: id,
        organizationId: transfer.organization_id,
        sourceBranchId: transfer.source_branch_id,
        sourceWarehouseId: transfer.source_warehouse_id,
        allocations: inventoryAllocations,
        userId: user.id,
        connection,
      });

      // Record batch allocations
      const batchAllocationRecords = inventoryAllocations.map((a) => ({
        transferId: id,
        transferLineId: a.transferLineId,
        batchId: a.batchId,
        sourceStorageLocationId: a.sourceStorageLocationId,
        quantityAllocated: a.quantity,
        quantityDispatched: a.quantity,
        status: 'dispatched',
      }));
      await stockTransferRepository.createBatchAllocations(batchAllocationRecords, connection);

      // Update transfer lines with dispatched and in_transit quantities
      for (const [lineId, totalDispatched] of allocationsByLine.entries()) {
        await stockTransferRepository.updateTransferLine(lineId, {
          quantity_dispatched: totalDispatched,
          quantity_in_transit: totalDispatched,
        }, connection);
      }

      // Update transfer status to in_transit
      await stockTransferRepository.updateTransfer(id, {
        status: 'in_transit',
        dispatched_by: user.id,
        dispatched_at: new Date(),
        dispatch_notes: payload.dispatchNotes || null,
      }, connection);

      await auditService.log({
        organizationId: transfer.organization_id,
        branchId: transfer.source_branch_id,
        warehouseId: transfer.source_warehouse_id,
        actorUserId: user.id,
        action: 'stock_transfer.dispatched',
        resourceType: 'stock_transfer',
        resourceId: id,
        resourceReference: transfer.transfer_number,
        reason: payload.dispatchNotes || 'Transfer dispatched',
        details: { destinationWarehouseId: transfer.destination_warehouse_id },
      }, connection);

      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async receiveTransfer(id, payload, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (!['in_transit', 'partially_received'].includes(transfer.status)) {
      throw new AppError(`Cannot receive transfer in '${transfer.status}' status. Transfer must be 'in_transit' or 'partially_received'.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    // Must have scope on destination warehouse/branch
    const scopeSets = await getScopeSets(user.id);
    const canAccessDestination =
      scopeSets.orgIds.includes(Number(transfer.organization_id)) ||
      scopeSets.branchIds.includes(Number(transfer.destination_branch_id)) ||
      scopeSets.warehouseIds.includes(Number(transfer.destination_warehouse_id));
    if (!canAccessDestination) {
      throw new AppError('You do not have access to receive stock at the destination warehouse.', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (!payload.receipts || !Array.isArray(payload.receipts) || payload.receipts.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'receipts', message: 'At least one receipt allocation is required' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const allocMap = new Map(transfer.batch_allocations.map((a) => [a.id, a]));
      const lineMap = new Map(transfer.lines.map((l) => [l.id, l]));

      const inventoryReceipts = [];
      let totalDiscrepancyEncountered = 0;

      for (let i = 0; i < payload.receipts.length; i++) {
        const item = payload.receipts[i];
        const alloc = allocMap.get(Number(item.batchAllocationId));
        if (!alloc) {
          throw new ValidationError('Validation failed', [{ field: `receipts[${i}].batchAllocationId`, message: 'Invalid batch allocation ID' }]);
        }

        const line = lineMap.get(alloc.transfer_line_id);
        const qtyReceived = Number(item.quantityReceived);
        if (!Number.isFinite(qtyReceived) || qtyReceived < 0) {
          throw new ValidationError('Validation failed', [{ field: `receipts[${i}].quantityReceived`, message: 'Received quantity must be a non-negative number' }]);
        }

        const remainingInTransit = Number(alloc.quantity_dispatched) - Number(alloc.quantity_received) - Number(alloc.quantity_discrepancy);
        if (qtyReceived > remainingInTransit) {
          throw new AppError(
            `Received quantity (${qtyReceived}) cannot exceed remaining in-transit quantity (${remainingInTransit}) for batch #${alloc.batch_id}`,
            { statusCode: 409, code: 'OVER_RECEIPT_REJECTED' },
          );
        }

        // Validate destination storage location
        const destLocId = Number(item.destinationStorageLocationId);
        const [destLocRows] = await connection.query(
          'SELECT id, warehouse_id, status FROM storage_locations WHERE id = ? LIMIT 1',
          [destLocId],
        );
        const destLoc = destLocRows[0];
        if (!destLoc || destLoc.warehouse_id !== transfer.destination_warehouse_id) {
          throw new ValidationError('Validation failed', [{ field: `receipts[${i}].destinationStorageLocationId`, message: 'Destination storage location does not belong to destination warehouse' }]);
        }
        if (destLoc.status !== 'active') {
          throw new AppError('Destination storage location is inactive', { statusCode: 409, code: 'STORAGE_LOCATION_INACTIVE' });
        }

        // Calculate discrepancy if this receipt is marked complete for this allocation
        let qtyDiscrepancy = 0;
        if (item.isFinal || payload.isFinalReceiving) {
          qtyDiscrepancy = Math.max(0, remainingInTransit - qtyReceived);
        }
        if (qtyDiscrepancy > 0) {
          totalDiscrepancyEncountered += qtyDiscrepancy;
        }

        if (qtyReceived > 0) {
          inventoryReceipts.push({
            productId: line.product_id,
            unitId: line.unit_id,
            batchId: alloc.batch_id,
            destinationStorageLocationId: destLoc.id,
            quantity: qtyReceived,
            condition: item.condition || 'good',
            reason: `Transfer receipt ${transfer.transfer_number}`,
          });
        }

        // Update batch allocation
        const newAllocStatus = (Number(alloc.quantity_received) + qtyReceived + qtyDiscrepancy >= Number(alloc.quantity_dispatched))
          ? (qtyDiscrepancy > 0 ? 'discrepancy' : 'received')
          : 'allocated';

        await stockTransferRepository.updateBatchAllocation(alloc.id, {
          destination_storage_location_id: destLoc.id,
          quantity_received: Number(alloc.quantity_received) + qtyReceived,
          quantity_discrepancy: Number(alloc.quantity_discrepancy) + qtyDiscrepancy,
          discrepancy_reason: item.discrepancyReason || alloc.discrepancy_reason || null,
          status: newAllocStatus,
        }, connection);

        // Update transfer line
        await stockTransferRepository.updateTransferLine(line.id, {
          quantity_received: Number(line.quantity_received) + qtyReceived,
          quantity_in_transit: Math.max(0, Number(line.quantity_in_transit) - (qtyReceived + qtyDiscrepancy)),
          quantity_discrepancy: Number(line.quantity_discrepancy) + qtyDiscrepancy,
          discrepancy_reason: item.discrepancyReason || line.discrepancy_reason || null,
        }, connection);
      }

      // Mutate inventory at destination warehouse through inventoryService
      if (inventoryReceipts.length > 0) {
        await inventoryService.receiveStockTransfer({
          transferId: id,
          organizationId: transfer.organization_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          receipts: inventoryReceipts,
          userId: user.id,
          connection,
        });
      }

      // Determine updated status
      const [updatedLines] = await connection.query(
        'SELECT quantity_dispatched, quantity_received, quantity_discrepancy, quantity_in_transit FROM stock_transfer_lines WHERE transfer_id = ?',
        [id],
      );

      const totalDispatchedAll = updatedLines.reduce((acc, l) => acc + Number(l.quantity_dispatched), 0);
      const totalAccountedAll = updatedLines.reduce((acc, l) => acc + Number(l.quantity_received) + Number(l.quantity_discrepancy), 0);
      const remainingInTransitTotal = updatedLines.reduce((acc, l) => acc + Number(l.quantity_in_transit), 0);

      let newTransferStatus = 'partially_received';
      if (payload.isFinalReceiving || remainingInTransitTotal <= 0 || totalAccountedAll >= totalDispatchedAll) {
        newTransferStatus = 'completed';
      }

      const hasDiscrepancy = totalDiscrepancyEncountered > 0 || transfer.has_discrepancy || updatedLines.some((l) => Number(l.quantity_discrepancy) > 0);

      await stockTransferRepository.updateTransfer(id, {
        status: newTransferStatus,
        received_by: user.id,
        received_at: new Date(),
        receiving_notes: payload.receivingNotes || transfer.receiving_notes,
        has_discrepancy: hasDiscrepancy ? 1 : 0,
      }, connection);

      await auditService.log({
        organizationId: transfer.organization_id,
        branchId: transfer.destination_branch_id,
        warehouseId: transfer.destination_warehouse_id,
        actorUserId: user.id,
        action: 'stock_transfer.received',
        resourceType: 'stock_transfer',
        resourceId: id,
        resourceReference: transfer.transfer_number,
        reason: payload.receivingNotes || 'Transfer received at destination',
        details: { status: newTransferStatus, hasDiscrepancy: Boolean(hasDiscrepancy) },
      }, connection);

      await connection.commit();
      const details = await stockTransferRepository.findWithDetails(id);
      return details;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async resolveDiscrepancy(id, payload, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });
    if (!transfer.has_discrepancy) {
      throw new AppError('Transfer has no discrepancy to resolve.', { statusCode: 409, code: 'NO_DISCREPANCY' });
    }
    if (transfer.discrepancy_resolved) {
      throw new AppError('Discrepancy has already been resolved.', { statusCode: 409, code: 'ALREADY_RESOLVED' });
    }

    if (!payload.resolutionNotes || !payload.resolutionNotes.trim()) {
      throw new ValidationError('Validation failed', [{ field: 'resolutionNotes', message: 'Resolution notes are mandatory' }]);
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await stockTransferRepository.updateTransfer(id, {
        discrepancy_resolved: 1,
        discrepancy_notes: payload.resolutionNotes.trim(),
        discrepancy_resolved_by: user.id,
        discrepancy_resolved_at: new Date(),
      }, connection);
      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async cancelTransfer(id, payload, user) {
    const transfer = await stockTransferRepository.findWithDetails(id);
    if (!transfer) throw new AppError('Stock transfer not found', { statusCode: 404, code: 'TRANSFER_NOT_FOUND' });

    if (['in_transit', 'partially_received', 'completed'].includes(transfer.status)) {
      throw new AppError(
        'Cannot cancel stock transfer that has already been dispatched. Physical inventory has already left the source warehouse.',
        { statusCode: 409, code: 'TRANSFER_ALREADY_DISPATCHED' },
      );
    }

    if (['rejected', 'cancelled'].includes(transfer.status)) {
      throw new AppError(`Transfer is already ${transfer.status}.`, { statusCode: 409, code: 'ALREADY_FINALIZED' });
    }

    if (!payload.cancellationReason || !payload.cancellationReason.trim()) {
      throw new ValidationError('Validation failed', [{ field: 'cancellationReason', message: 'Cancellation reason is mandatory' }]);
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessTransfer(scopeSets, transfer);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await stockTransferRepository.updateTransfer(id, {
        status: 'cancelled',
        cancelled_by: user.id,
        cancelled_at: new Date(),
        cancellation_reason: payload.cancellationReason.trim(),
      }, connection);
      await connection.commit();
      return stockTransferRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },
};

export default stockTransferService;
