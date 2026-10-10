import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import supplierReturnRepository from '../repositories/supplierReturnRepository.js';
import inventoryService from './inventoryService.js';
import auditService from './auditService.js';
import { getPool } from '../database/pool.js';
import logger from '../utils/logger.js';

function roundTo2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

async function getAccessibleOrgIds(scopeSets, connection) {
  if (scopeSets.orgIds.length > 0) return scopeSets.orgIds;
  if (scopeSets.branchIds.length > 0) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT DISTINCT organization_id FROM branches WHERE id IN (${scopeSets.branchIds.map(() => '?').join(',')})`,
      scopeSets.branchIds,
    );
    return rows.map((r) => r.organization_id);
  }
  return [];
}

function canAccess(scopeSets, row, accessibleOrgIds = []) {
  if (scopeSets.orgIds.includes(Number(row.organization_id))) return true;
  if (accessibleOrgIds.includes(Number(row.organization_id))) return true;
  if (scopeSets.branchIds.includes(Number(row.branch_id))) return true;
  return false;
}

async function generateSupplierReturnNumber(organizationId, connection) {
  const runner = connection || getPool();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `SR-${organizationId}-${dateStr}-${rand}`;
    const [rows] = await runner.query(
      'SELECT id FROM supplier_returns WHERE organization_id = ? AND return_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `SR-${organizationId}-${dateStr}-${Date.now().toString().slice(-6)}`;
}

export const supplierReturnService = {
  async listReturns(filters, userId) {
    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);

    return supplierReturnRepository.listSupplierReturns({
      ...filters,
      accessibleOrgIds: orgIds,
      accessibleBranchIds: sets.branchIds,
    });
  },

  async getReturnById(id, userId) {
    const returnRecord = await supplierReturnRepository.getReturnById(id);
    if (!returnRecord) {
      throw new AppError('Supplier return record not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!canAccess(sets, returnRecord, orgIds)) {
      throw new AppError('You do not have access to this supplier return', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const lines = await supplierReturnRepository.getReturnLines(id);
    return { ...returnRecord, lines };
  },

  async getReceiptEligibility(goodsReceiptId, userId) {
    const pool = getPool();
    const [receipts] = await pool.query(
      `SELECT gr.*, po.supplier_id, s.name AS supplier_name,
              b.name AS branch_name, w.name AS warehouse_name
       FROM goods_receipts gr
       JOIN purchase_orders po ON po.id = gr.purchase_order_id
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN branches b ON b.id = gr.branch_id
       JOIN warehouses w ON w.id = gr.warehouse_id
       WHERE gr.id = ? LIMIT 1`,
      [goodsReceiptId],
    );
    const receipt = receipts[0];
    if (!receipt) {
      throw new AppError('Goods receipt not found', { statusCode: 404, code: 'GOODS_RECEIPT_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!canAccess(sets, receipt, orgIds)) {
      throw new AppError('You do not have access to this goods receipt', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (receipt.status !== 'completed') {
      throw new AppError(`Cannot return goods receipt with status "${receipt.status}". Only completed receipts are eligible.`, {
        statusCode: 409,
        code: 'RECEIPT_NOT_ELIGIBLE',
      });
    }

    // Fetch receipt lines with purchase order unit price and batch info
    const [lines] = await pool.query(
      `SELECT grl.*,
              pol.unit_price,
              p.name AS product_name, p.code AS product_code,
              u.name AS unit_name, u.code AS unit_code,
              b.id AS batch_id, b.batch_number AS resolved_batch_number, b.expiry_date AS resolved_expiry_date
       FROM goods_receipt_lines grl
       JOIN purchase_order_lines pol ON pol.id = grl.purchase_order_line_id
       JOIN products p ON p.id = grl.product_id
       JOIN units u ON u.id = grl.unit_id
       LEFT JOIN batches b ON b.organization_id = ? AND b.product_id = grl.product_id AND b.batch_number = grl.batch_number
       WHERE grl.goods_receipt_id = ?
       ORDER BY grl.id ASC`,
      [receipt.organization_id, goodsReceiptId],
    );

    const eligibleLines = [];
    for (const line of lines) {
      const alreadyReturned = await supplierReturnRepository.getPreviouslyReturnedQuantityForReceiptLine(line.id);
      const remainingReturnable = Math.max(0, roundTo2(Number(line.received_quantity) - alreadyReturned));

      eligibleLines.push({
        ...line,
        already_returned_quantity: alreadyReturned,
        remaining_returnable_quantity: remainingReturnable,
        is_returnable: remainingReturnable > 0,
      });
    }

    return {
      receipt,
      lines: eligibleLines,
    };
  },

  async createReturn(input, userId) {
    const goodsReceiptId = Number(input?.goodsReceiptId);
    if (!Number.isFinite(goodsReceiptId) || goodsReceiptId <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'goodsReceiptId', message: 'Valid goodsReceiptId is required' }]);
    }

    const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
    if (!reason) {
      throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Return reason is required' }]);
    }

    const rawLines = Array.isArray(input?.lines) ? input.lines : [];
    if (rawLines.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'lines', message: 'At least one return line is required' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Lock receipt
      const [receipts] = await connection.query(
        `SELECT gr.*, po.supplier_id
         FROM goods_receipts gr
         JOIN purchase_orders po ON po.id = gr.purchase_order_id
         WHERE gr.id = ? FOR UPDATE`,
        [goodsReceiptId],
      );
      const receipt = receipts[0];
      if (!receipt) {
        throw new AppError('Goods receipt not found', { statusCode: 404, code: 'GOODS_RECEIPT_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, receipt, orgIds)) {
        throw new AppError('You do not have access to this goods receipt', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (receipt.status !== 'completed') {
        throw new AppError(`Cannot return goods receipt with status "${receipt.status}". Only completed receipts are eligible.`, {
          statusCode: 409,
          code: 'RECEIPT_NOT_ELIGIBLE',
        });
      }

      const processedLines = [];
      let totalAmount = 0;

      for (let i = 0; i < rawLines.length; i += 1) {
        const l = rawLines[i];
        const grLineId = Number(l.goodsReceiptLineId);
        const qty = Number(l.quantity);

        if (!Number.isFinite(qty) || qty <= 0) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].quantity`, message: 'Quantity must be greater than zero' },
          ]);
        }

        const [grlRows] = await connection.query(
          `SELECT grl.*, pol.unit_price, p.name AS product_name
           FROM goods_receipt_lines grl
           JOIN purchase_order_lines pol ON pol.id = grl.purchase_order_line_id
           JOIN products p ON p.id = grl.product_id
           WHERE grl.id = ? AND grl.goods_receipt_id = ? LIMIT 1`,
          [grLineId, goodsReceiptId],
        );
        const grLine = grlRows[0];
        if (!grLine) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].goodsReceiptLineId`, message: 'Goods receipt line does not belong to this receipt' },
          ]);
        }

        const alreadyReturned = await supplierReturnRepository.getPreviouslyReturnedQuantityForReceiptLine(grLineId, null, connection);
        const maxReturnable = roundTo2(Number(grLine.received_quantity) - alreadyReturned);

        if (roundTo2(qty) > maxReturnable) {
          throw new AppError(
            `Requested return quantity (${qty}) exceeds remaining returnable quantity (${maxReturnable}) for product ${grLine.product_name}`,
            { statusCode: 400, code: 'RETURN_QUANTITY_EXCEEDED' },
          );
        }

        // Resolve batch
        let batchId = l.batchId ? Number(l.batchId) : null;
        if (!batchId) {
          const [batchRows] = await connection.query(
            `SELECT id FROM batches WHERE organization_id = ? AND product_id = ? AND batch_number = ? LIMIT 1`,
            [receipt.organization_id, grLine.product_id, grLine.batch_number],
          );
          if (batchRows.length > 0) {
            batchId = batchRows[0].id;
          }
        }

        if (!batchId) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].batchId`, message: `Could not resolve batch for returned product ${grLine.product_name}` },
          ]);
        }

        const unitPrice = Number(grLine.unit_price || 0);
        const lineTotal = roundTo2(qty * unitPrice);
        totalAmount = roundTo2(totalAmount + lineTotal);

        processedLines.push({
          goodsReceiptLineId: grLineId,
          productId: grLine.product_id,
          batchId,
          unitId: grLine.unit_id,
          storageLocationId: l.storageLocationId ? Number(l.storageLocationId) : grLine.storage_location_id,
          quantity: qty,
          unitPrice,
          lineTotal,
          reason: l.reason ? String(l.reason).trim() : reason,
        });
      }

      const returnNumber = await generateSupplierReturnNumber(receipt.organization_id, connection);
      const initialStatus = input?.submit ? 'submitted' : 'draft';

      const returnId = await supplierReturnRepository.createReturn(
        {
          organizationId: receipt.organization_id,
          branchId: receipt.branch_id,
          warehouseId: receipt.warehouse_id,
          supplierId: receipt.supplier_id,
          goodsReceiptId: receipt.id,
          returnNumber,
          status: initialStatus,
          reason,
          totalAmount,
          notes: input?.notes ? String(input.notes).trim() : null,
          createdBy: userId,
        },
        connection,
      );

      for (const line of processedLines) {
        line.supplierReturnId = returnId;
      }
      await supplierReturnRepository.createReturnLines(processedLines, connection);

      await connection.commit();

      logger.info('Supplier return created', {
        userId,
        supplierReturnId: returnId,
        returnNumber,
        status: initialStatus,
      });

      return supplierReturnService.getReturnById(returnId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async submitReturn(id, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Supplier return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this supplier return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'draft') {
        throw new AppError(`Cannot submit return with status "${ret.status}". Must be draft.`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await supplierReturnRepository.updateReturn(id, { status: 'submitted' }, connection);
      await connection.commit();

      logger.info('Supplier return submitted', { userId, supplierReturnId: id });
      return supplierReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async approveReturn(id, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Supplier return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this supplier return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'draft' && ret.status !== 'submitted') {
        throw new AppError(`Cannot approve return with status "${ret.status}". Must be draft or submitted.`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await supplierReturnRepository.updateReturn(
        id,
        {
          status: 'approved',
          approved_by: userId,
          approved_at: new Date(),
        },
        connection,
      );

      await connection.commit();
      logger.info('Supplier return approved', { userId, supplierReturnId: id });
      return supplierReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async completeReturn(id, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Supplier return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      // Idempotency: if already completed, return without error
      if (ret.status === 'completed') {
        await connection.rollback();
        return supplierReturnService.getReturnById(id, userId);
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this supplier return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'approved') {
        throw new AppError(`Cannot complete supplier return with status "${ret.status}". Must be approved first.`, {
          statusCode: 409,
          code: 'RETURN_NOT_APPROVED',
        });
      }

      const lines = await supplierReturnRepository.getReturnLines(id, connection);

      // Authoritative inventory mutation via inventoryService
      const inventoryMutationLines = lines.map((l) => ({
        productId: l.product_id,
        batchId: l.batch_id,
        batchNumber: l.batch_number,
        unitId: l.unit_id,
        storageLocationId: l.storage_location_id,
        quantity: l.quantity,
        reason: l.reason,
      }));

      await inventoryService.deductSupplierReturnStock({
        supplierReturnId: ret.id,
        organizationId: ret.organization_id,
        branchId: ret.branch_id,
        warehouseId: ret.warehouse_id,
        lines: inventoryMutationLines,
        userId,
        connection,
      });

      // Update return status to completed
      await supplierReturnRepository.updateReturn(
        id,
        {
          status: 'completed',
          completed_by: userId,
          completed_at: new Date(),
        },
        connection,
      );

      await auditService.log({
        organizationId: ret.organization_id,
        branchId: ret.branch_id,
        actorUserId: userId,
        action: 'supplier_return.completed',
        resourceType: 'supplier_return',
        resourceId: id,
        resourceReference: ret.return_number,
        reason: 'Supplier return completed and stock deducted',
      }, connection);

      await connection.commit();
      logger.info('Supplier return completed and stock deducted', { userId, supplierReturnId: id });
      return supplierReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async cancelReturn(id, input, userId) {
    const cancellationReason = typeof input?.reason === 'string' ? input.reason.trim() : '';
    if (!cancellationReason) {
      throw new ValidationError('Validation failed', [
        { field: 'reason', message: 'Cancellation reason is mandatory' },
      ]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Supplier return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this supplier return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status === 'completed' || ret.status === 'cancelled') {
        throw new AppError(`Cannot cancel supplier return with status "${ret.status}"`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await supplierReturnRepository.updateReturn(
        id,
        {
          status: 'cancelled',
          cancellation_reason: cancellationReason,
        },
        connection,
      );

      await connection.commit();
      logger.info('Supplier return cancelled', { userId, supplierReturnId: id, cancellationReason });
      return supplierReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },
};

export default supplierReturnService;
