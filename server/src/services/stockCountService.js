import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import { getPool } from '../database/pool.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import stockCountRepository from '../repositories/stockCountRepository.js';
import auditService from './auditService.js';
import notificationService from './notificationService.js';

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

function assertUserCanAccessCount(userScope, count) {
  const hasAccess =
    userScope.orgIds.includes(Number(count.organization_id)) ||
    userScope.branchIds.includes(Number(count.branch_id)) ||
    userScope.warehouseIds.includes(Number(count.warehouse_id));

  if (!hasAccess) {
    throw new AppError('You do not have access to this stock count scope.', {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }
}

export const stockCountService = {
  async listStockCounts(query, user) {
    const scopeSets = await getScopeSets(user.id);
    return stockCountRepository.listStockCounts({
      organizationId: query.organizationId ? Number(query.organizationId) : undefined,
      branchId: query.branchId ? Number(query.branchId) : undefined,
      warehouseId: query.warehouseId ? Number(query.warehouseId) : undefined,
      storageLocationId: query.storageLocationId ? Number(query.storageLocationId) : undefined,
      status: query.status,
      countType: query.countType,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
      accessibleOrgIds: scopeSets.orgIds,
      accessibleBranchIds: scopeSets.branchIds,
      accessibleWarehouseIds: scopeSets.warehouseIds,
    });
  },

  async getStockCount(id, user) {
    const count = await stockCountRepository.findWithDetails(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);
    return count;
  },

  async createStockCount(payload, user) {
    const errors = [];
    if (!payload.organizationId) errors.push({ field: 'organizationId', message: 'Organization is required' });
    if (!payload.branchId) errors.push({ field: 'branchId', message: 'Branch is required' });
    if (!payload.warehouseId) errors.push({ field: 'warehouseId', message: 'Warehouse is required' });
    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    const orgId = Number(payload.organizationId);
    const branchId = Number(payload.branchId);
    const warehouseId = Number(payload.warehouseId);
    const storageLocationId = payload.storageLocationId ? Number(payload.storageLocationId) : null;
    const countType = payload.countType || 'full';

    const scopeSets = await getScopeSets(user.id);
    const hasOrgAccess = scopeSets.orgIds.includes(orgId);
    const hasBranchAccess = scopeSets.branchIds.includes(branchId);
    const hasWarehouseAccess = scopeSets.warehouseIds.includes(warehouseId);

    if (!hasOrgAccess && !hasBranchAccess && !hasWarehouseAccess) {
      throw new AppError('You do not have permission to initiate stock counts in this location.', {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }

    const pool = getPool();
    // Validate branch belongs to organization
    const [branchRows] = await pool.query('SELECT organization_id, status FROM branches WHERE id = ?', [branchId]);
    if (!branchRows[0] || branchRows[0].organization_id !== orgId) {
      throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Branch does not belong to specified organization' }]);
    }
    if (branchRows[0].status !== 'active') {
      throw new AppError('Branch is inactive', { statusCode: 409, code: 'BRANCH_INACTIVE' });
    }

    // Validate warehouse belongs to branch
    const [warehouseRows] = await pool.query('SELECT branch_id, status FROM warehouses WHERE id = ?', [warehouseId]);
    if (!warehouseRows[0] || warehouseRows[0].branch_id !== branchId) {
      throw new ValidationError('Validation failed', [{ field: 'warehouseId', message: 'Warehouse does not belong to specified branch' }]);
    }
    if (warehouseRows[0].status !== 'active') {
      throw new AppError('Warehouse is inactive', { statusCode: 409, code: 'WAREHOUSE_INACTIVE' });
    }

    // If storage location provided, validate it belongs to warehouse
    if (storageLocationId) {
      const [locRows] = await pool.query('SELECT warehouse_id, status FROM storage_locations WHERE id = ?', [storageLocationId]);
      if (!locRows[0] || locRows[0].warehouse_id !== warehouseId) {
        throw new ValidationError('Validation failed', [{ field: 'storageLocationId', message: 'Storage location does not belong to specified warehouse' }]);
      }
    }

    const count = await stockCountRepository.createStockCount({
      organizationId: orgId,
      branchId,
      warehouseId,
      storageLocationId,
      countType,
      status: 'draft',
      notes: payload.notes || null,
      userId: user.id,
    });

    return stockCountRepository.findWithDetails(count.id);
  },

  async startStockCount(id, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (count.status !== 'draft') {
      throw new AppError(`Cannot start count in '${count.status}' status. Count must be in 'draft' status.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Find eligible inventory snapshot items in the target warehouse / location
      const snapshotInventory = await stockCountRepository.findEligibleInventoryForSnapshot({
        organizationId: count.organization_id,
        branchId: count.branch_id,
        warehouseId: count.warehouse_id,
        storageLocationId: count.storage_location_id,
      }, connection);

      const lines = snapshotInventory.map((item) => ({
        storageLocationId: item.storage_location_id,
        productId: item.product_id,
        batchId: item.batch_id,
        unitId: item.unit_id,
        inventoryStatus: item.inventory_status,
        systemQuantity: Number(item.system_quantity),
        countedQuantity: null,
        isCounted: false,
        varianceQuantity: null,
      }));

      if (lines.length > 0) {
        await stockCountRepository.insertCountLines(id, lines, connection);
      }

      const now = new Date();
      await stockCountRepository.updateStockCount(id, {
        status: 'in_progress',
        started_by: user.id,
        started_at: now,
        snapshot_at: now,
      }, connection);

      await connection.commit();
      return stockCountRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async recordCountLines(id, payload, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (count.status !== 'in_progress') {
      throw new AppError(`Cannot record counts in '${count.status}' status. Session must be 'in_progress'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    if (!payload.lines || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'lines', message: 'At least one count entry is required' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (let i = 0; i < payload.lines.length; i++) {
        const item = payload.lines[i];
        const lineId = Number(item.lineId);
        const line = await stockCountRepository.getLineById(lineId, connection);
        if (!line || line.stock_count_id !== count.id) {
          throw new ValidationError('Validation failed', [{ field: `lines[${i}].lineId`, message: 'Invalid line ID for this count session' }]);
        }

        const countedQty = Number(item.countedQuantity);
        if (!Number.isFinite(countedQty) || countedQty < 0) {
          throw new ValidationError('Validation failed', [{ field: `lines[${i}].countedQuantity`, message: 'Counted quantity must be a non-negative number' }]);
        }

        const systemQty = Number(line.system_quantity);
        const variance = countedQty - systemQty;

        if (variance !== 0 && (!item.varianceReason || !item.varianceReason.trim())) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].varianceReason`, message: `Reason is required for non-zero discrepancy (variance: ${variance})` },
          ]);
        }

        const isRevision = line.is_counted === 1;
        await stockCountRepository.updateCountLine(line.id, {
          counted_quantity: countedQty,
          is_counted: 1,
          variance_quantity: variance,
          variance_reason: item.varianceReason ? item.varianceReason.trim() : null,
          notes: item.notes ? item.notes.trim() : line.notes,
          counted_by: user.id,
          counted_at: new Date(),
          recount_requested: 0,
        }, connection);

        // Audit line event
        await stockCountRepository.insertLineEvent({
          stockCountLineId: line.id,
          eventType: isRevision ? 'correction' : 'initial_count',
          previousCountedQuantity: line.counted_quantity,
          newCountedQuantity: countedQty,
          reason: item.varianceReason || item.notes || (isRevision ? 'Count corrected' : 'Initial physical count recorded'),
          performedBy: user.id,
        }, connection);
      }

      await connection.commit();
      return stockCountRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async requestRecount(id, payload, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (!['in_progress', 'submitted'].includes(count.status)) {
      throw new AppError(`Cannot request recount in '${count.status}' status.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const lineIds = Array.isArray(payload.lineIds) && payload.lineIds.length > 0 ? payload.lineIds.map(Number) : null;
      const notes = payload.recountNotes || payload.notes || 'Recount requested by supervisor';

      if (lineIds) {
        for (const lineId of lineIds) {
          const line = await stockCountRepository.getLineById(lineId, connection);
          if (line && line.stock_count_id === count.id) {
            await stockCountRepository.updateCountLine(line.id, {
              recount_requested: 1,
              recount_notes: notes,
            }, connection);

            await stockCountRepository.insertLineEvent({
              stockCountLineId: line.id,
              eventType: 'recount',
              previousCountedQuantity: line.counted_quantity,
              newCountedQuantity: line.counted_quantity || 0,
              reason: notes,
              performedBy: user.id,
            }, connection);
          }
        }
      } else {
        // Flag all lines with non-zero variance
        const [lines] = await connection.query('SELECT id, counted_quantity FROM stock_count_lines WHERE stock_count_id = ? AND variance_quantity != 0', [id]);
        for (const l of lines) {
          await stockCountRepository.updateCountLine(l.id, { recount_requested: 1, recount_notes: notes }, connection);
          await stockCountRepository.insertLineEvent({
            stockCountLineId: l.id,
            eventType: 'recount',
            previousCountedQuantity: l.counted_quantity,
            newCountedQuantity: l.counted_quantity || 0,
            reason: notes,
            performedBy: user.id,
          }, connection);
        }
      }

      // Revert status to in_progress if submitted
      if (count.status === 'submitted') {
        await stockCountRepository.updateStockCount(id, { status: 'in_progress' }, connection);
      }

      await connection.commit();
      return stockCountRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async submitStockCount(id, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (count.status !== 'in_progress') {
      throw new AppError(`Cannot submit count in '${count.status}' status. Session must be 'in_progress'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    const pool = getPool();
    const [lineCountRows] = await pool.query(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN is_counted = 1 THEN 1 ELSE 0 END) AS counted FROM stock_count_lines WHERE stock_count_id = ?',
      [id],
    );

    const total = Number(lineCountRows[0]?.total || 0);
    const counted = Number(lineCountRows[0]?.counted || 0);

    if (total === 0) {
      throw new AppError('Cannot submit stock count session with no lines.', { statusCode: 400, code: 'NO_COUNT_LINES' });
    }

    await stockCountRepository.updateStockCount(id, {
      status: 'submitted',
      submitted_by: user.id,
      submitted_at: new Date(),
    });

    return stockCountRepository.findWithDetails(id);
  },

  async approveStockCount(id, payload, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (!['submitted', 'pending_approval'].includes(count.status)) {
      throw new AppError(`Cannot approve count in '${count.status}' status. Session must be 'submitted'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    await stockCountRepository.updateStockCount(id, {
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date(),
      approval_notes: payload.approvalNotes ? payload.approvalNotes.trim() : null,
    });

    return stockCountRepository.findWithDetails(id);
  },

  async rejectStockCount(id, payload, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (!['submitted', 'pending_approval'].includes(count.status)) {
      throw new AppError(`Cannot reject count in '${count.status}' status. Session must be 'submitted'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    if (!payload.rejectionReason || !payload.rejectionReason.trim()) {
      throw new ValidationError('Validation failed', [{ field: 'rejectionReason', message: 'Rejection reason is required' }]);
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    await stockCountRepository.updateStockCount(id, {
      status: 'rejected',
      rejection_reason: payload.rejectionReason.trim(),
    });

    return stockCountRepository.findWithDetails(id);
  },

  async applyAdjustments(id, user) {
    const count = await stockCountRepository.findWithDetails(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (count.status !== 'approved') {
      throw new AppError(`Cannot apply adjustments in '${count.status}' status. Session must be 'approved'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    // Identify all counted lines with non-zero variance
    const varianceLines = (count.lines || []).filter((l) => l.is_counted === 1 && Number(l.variance_quantity) !== 0);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (varianceLines.length > 0) {
        const adjustments = varianceLines.map((l) => ({
          countLineId: l.id,
          storageLocationId: l.storage_location_id,
          productId: l.product_id,
          batchId: l.batch_id,
          unitId: l.unit_id,
          inventoryStatus: l.inventory_status,
          expectedSystemQuantity: Number(l.system_quantity),
          varianceQuantity: Number(l.variance_quantity),
          varianceReason: l.variance_reason,
        }));

        // Authoritatively apply adjustments via inventoryService
        await inventoryService.applyStockAdjustment({
          countId: count.id,
          organizationId: count.organization_id,
          branchId: count.branch_id,
          warehouseId: count.warehouse_id,
          adjustments,
          userId: user.id,
          connection,
        });

        // Audit events for applied adjustments
        for (const l of varianceLines) {
          await stockCountRepository.insertLineEvent({
            stockCountLineId: l.id,
            eventType: 'approved_adjustment',
            previousCountedQuantity: l.system_quantity,
            newCountedQuantity: l.counted_quantity,
            reason: `Stock adjustment applied: variance ${l.variance_quantity}`,
            performedBy: user.id,
          }, connection);
        }
      }

      await stockCountRepository.updateStockCount(id, {
        status: 'completed',
        applied_by: user.id,
        applied_at: new Date(),
      }, connection);

      await auditService.log({
        organizationId: count.organization_id,
        branchId: count.branch_id,
        warehouseId: count.warehouse_id,
        actorUserId: user.id,
        action: 'stock_count.adjusted',
        resourceType: 'stock_count',
        resourceId: count.id,
        resourceReference: count.count_number,
        reason: 'Approved stock count variance adjustments applied to inventory',
        details: { linesAdjusted: varianceLines.length },
      }, connection);

      if (varianceLines.length > 0) {
        await notificationService.notifyByPermission({
          organizationId: count.organization_id,
          branchId: count.branch_id,
          warehouseId: count.warehouse_id,
          permission: 'stock_count.view',
          type: 'stock_adjustment',
          title: 'Stock Count Adjustments Applied',
          message: `Stock count ${count.count_number} finalized with ${varianceLines.length} line adjustments.`,
          severity: 'warning',
          resourceType: 'stock_count',
          resourceId: count.id,
          resourceReference: count.count_number,
          actionUrl: `/inventory/stock-counts/${count.id}`,
          dedupKey: `stock_count:adjusted:${count.id}`,
          connection,
        });
      }

      await connection.commit();
      return stockCountRepository.findWithDetails(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async cancelStockCount(id, payload, user) {
    const count = await stockCountRepository.findById(id);
    if (!count) {
      throw new AppError('Stock count session not found', { statusCode: 404, code: 'COUNT_NOT_FOUND' });
    }
    if (['completed', 'cancelled'].includes(count.status)) {
      throw new AppError(`Cannot cancel count in '${count.status}' status.`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    const scopeSets = await getScopeSets(user.id);
    assertUserCanAccessCount(scopeSets, count);

    await stockCountRepository.updateStockCount(id, {
      status: 'cancelled',
      cancellation_reason: payload.cancellationReason ? payload.cancellationReason.trim() : null,
    });

    return stockCountRepository.findWithDetails(id);
  },
};

export default stockCountService;
