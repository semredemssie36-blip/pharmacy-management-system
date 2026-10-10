import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import customerReturnRepository from '../repositories/customerReturnRepository.js';
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

async function generateCustomerReturnNumber(organizationId, connection) {
  const runner = connection || getPool();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `CR-${organizationId}-${dateStr}-${rand}`;
    const [rows] = await runner.query(
      'SELECT id FROM customer_returns WHERE organization_id = ? AND return_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `CR-${organizationId}-${dateStr}-${Date.now().toString().slice(-6)}`;
}

async function generateRefundNumber(organizationId, connection) {
  const runner = connection || getPool();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `REF-${organizationId}-${dateStr}-${rand}`;
    const [rows] = await runner.query(
      'SELECT id FROM refunds WHERE organization_id = ? AND refund_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `REF-${organizationId}-${dateStr}-${Date.now().toString().slice(-6)}`;
}

export const customerReturnService = {
  async listReturns(filters, userId) {
    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);

    return customerReturnRepository.listCustomerReturns({
      ...filters,
      accessibleOrgIds: orgIds,
      accessibleBranchIds: sets.branchIds,
    });
  },

  async getReturnById(id, userId) {
    const returnRecord = await customerReturnRepository.getReturnById(id);
    if (!returnRecord) {
      throw new AppError('Customer return record not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!canAccess(sets, returnRecord, orgIds)) {
      throw new AppError('You do not have access to this customer return', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const lines = await customerReturnRepository.getReturnLines(id);
    return { ...returnRecord, lines };
  },

  async getSaleEligibility(saleId, userId) {
    const pool = getPool();
    const [sales] = await pool.query(
      `SELECT s.*, b.name AS branch_name, w.name AS warehouse_name, c.name AS customer_name
       FROM sales s
       JOIN branches b ON b.id = s.branch_id
       JOIN warehouses w ON w.id = s.warehouse_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ? LIMIT 1`,
      [saleId],
    );
    const sale = sales[0];
    if (!sale) {
      throw new AppError('Original sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!canAccess(sets, sale, orgIds)) {
      throw new AppError('You do not have access to this sale', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (sale.status !== 'completed') {
      throw new AppError(`Cannot return sale with status "${sale.status}". Only completed sales are eligible for return.`, {
        statusCode: 409,
        code: 'SALE_NOT_ELIGIBLE',
      });
    }

    // Fetch sale lines with already-returned quantities
    const [lines] = await pool.query(
      `SELECT sl.*,
              p.name AS product_name, p.code AS product_code, p.prescription_classification,
              u.name AS unit_name, u.code AS unit_code
       FROM sale_lines sl
       JOIN products p ON p.id = sl.product_id
       JOIN units u ON u.id = sl.unit_id
       WHERE sl.sale_id = ?
       ORDER BY sl.id ASC`,
      [saleId],
    );

    // Fetch batch allocations for each sale line
    const eligibleLines = [];
    for (const line of lines) {
      const alreadyReturned = await customerReturnRepository.getPreviouslyReturnedQuantityForSaleLine(line.id);
      const remainingReturnable = Math.max(0, roundTo2(Number(line.quantity) - alreadyReturned));

      const [allocations] = await pool.query(
        `SELECT sba.*, b.batch_number, b.expiry_date, b.status AS batch_status
         FROM sale_batch_allocations sba
         JOIN batches b ON b.id = sba.batch_id
         WHERE sba.sale_line_id = ?`,
        [line.id],
      );

      eligibleLines.push({
        ...line,
        already_returned_quantity: alreadyReturned,
        remaining_returnable_quantity: remainingReturnable,
        is_returnable: remainingReturnable > 0,
        allocations,
      });
    }

    return {
      sale,
      lines: eligibleLines,
    };
  },

  async createReturn(input, userId) {
    const saleId = Number(input?.saleId);
    if (!Number.isFinite(saleId) || saleId <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'saleId', message: 'Valid saleId is required' }]);
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

      // Lock sale row
      const [sales] = await connection.query(
        `SELECT s.* FROM sales s WHERE s.id = ? FOR UPDATE`,
        [saleId],
      );
      const sale = sales[0];
      if (!sale) {
        throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, sale, orgIds)) {
        throw new AppError('You do not have access to this sale', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (sale.status !== 'completed') {
        throw new AppError(`Cannot return sale with status "${sale.status}". Only completed sales are eligible for return.`, {
          statusCode: 409,
          code: 'SALE_NOT_ELIGIBLE',
        });
      }

      // Validate lines against sale lines and previous return history
      const processedLines = [];
      let totalReturnAmount = 0;

      for (let i = 0; i < rawLines.length; i += 1) {
        const l = rawLines[i];
        const saleLineId = Number(l.saleLineId);
        const qty = Number(l.quantity);

        if (!Number.isFinite(qty) || qty <= 0) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].quantity`, message: 'Quantity must be greater than zero' },
          ]);
        }

        const [slRows] = await connection.query(
          `SELECT sl.*, p.name AS product_name
           FROM sale_lines sl
           JOIN products p ON p.id = sl.product_id
           WHERE sl.id = ? AND sl.sale_id = ? LIMIT 1`,
          [saleLineId, saleId],
        );
        const saleLine = slRows[0];
        if (!saleLine) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].saleLineId`, message: 'Sale line does not belong to this sale' },
          ]);
        }

        const alreadyReturned = await customerReturnRepository.getPreviouslyReturnedQuantityForSaleLine(saleLineId, null, connection);
        const maxReturnable = roundTo2(Number(saleLine.quantity) - alreadyReturned);

        if (roundTo2(qty) > maxReturnable) {
          throw new AppError(
            `Requested return quantity (${qty}) exceeds remaining returnable quantity (${maxReturnable}) for product ${saleLine.product_name}`,
            { statusCode: 400, code: 'RETURN_QUANTITY_EXCEEDED' },
          );
        }

        // Trace batch
        const batchId = Number(l.batchId);
        const [allocRows] = await connection.query(
          `SELECT sba.* FROM sale_batch_allocations sba WHERE sba.sale_line_id = ? AND sba.batch_id = ? LIMIT 1`,
          [saleLineId, batchId],
        );
        if (allocRows.length === 0) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].batchId`, message: `Batch ${batchId} was not allocated to this sale line` },
          ]);
        }

        const unitPrice = Number(saleLine.unit_price);
        const lineTotal = roundTo2(qty * unitPrice);
        totalReturnAmount = roundTo2(totalReturnAmount + lineTotal);

        processedLines.push({
          saleLineId,
          productId: saleLine.product_id,
          batchId,
          unitId: saleLine.unit_id,
          storageLocationId: l.storageLocationId ? Number(l.storageLocationId) : null,
          quantity: qty,
          unitPrice,
          lineTotal,
          conditionState: l.conditionState || 'sealed_intact',
          disposition: l.disposition || 'none',
          dispositionNotes: l.dispositionNotes || null,
        });
      }

      const returnNumber = await generateCustomerReturnNumber(sale.organization_id, connection);
      const initialStatus = input?.submit ? 'submitted' : 'draft';

      const returnId = await customerReturnRepository.createReturn(
        {
          organizationId: sale.organization_id,
          branchId: sale.branch_id,
          warehouseId: sale.warehouse_id,
          saleId: sale.id,
          customerId: sale.customer_id,
          returnNumber,
          status: initialStatus,
          reason,
          outcome: 'pending',
          refundAmount: totalReturnAmount,
          notes: input?.notes ? String(input.notes).trim() : null,
          createdBy: userId,
        },
        connection,
      );

      for (const line of processedLines) {
        line.customerReturnId = returnId;
      }
      await customerReturnRepository.createReturnLines(processedLines, connection);

      await connection.commit();

      logger.info('Customer return created', {
        userId,
        customerReturnId: returnId,
        returnNumber,
        status: initialStatus,
      });

      return customerReturnService.getReturnById(returnId, userId);
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
        'SELECT * FROM customer_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Customer return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'draft') {
        throw new AppError(`Cannot submit return with status "${ret.status}". Must be draft.`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await customerReturnRepository.updateReturn(id, { status: 'submitted' }, connection);
      await connection.commit();

      logger.info('Customer return submitted', { userId, customerReturnId: id });
      return customerReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async inspectReturn(id, input, userId) {
    const rawLines = Array.isArray(input?.lines) ? input.lines : [];
    if (rawLines.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Inspection results for lines are required' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM customer_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Customer return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'submitted' && ret.status !== 'pending_inspection') {
        throw new AppError(`Cannot inspect return with status "${ret.status}". Must be submitted or pending_inspection.`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      const validConditions = ['sealed_intact', 'opened', 'damaged', 'expired', 'unknown'];
      const validDispositions = ['quarantine', 'return_to_stock', 'damaged', 'awaiting_disposal', 'disposed', 'none'];

      for (let i = 0; i < rawLines.length; i += 1) {
        const line = rawLines[i];
        const lineId = Number(line.id);
        const condition = String(line.conditionState || 'sealed_intact');
        const disposition = String(line.disposition || 'quarantine');

        if (!validConditions.includes(condition)) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].conditionState`, message: `Condition must be one of: ${validConditions.join(', ')}` },
          ]);
        }
        if (!validDispositions.includes(disposition)) {
          throw new ValidationError('Validation failed', [
            { field: `lines[${i}].disposition`, message: `Disposition must be one of: ${validDispositions.join(', ')}` },
          ]);
        }

        // Enforce safety rule: unsealed medicines cannot be returned to stock
        if (disposition === 'return_to_stock' && condition !== 'sealed_intact') {
          throw new AppError(
            `Medicine in condition "${condition}" cannot be returned to available stock. Only sealed intact items may be returned to stock.`,
            { statusCode: 400, code: 'CANNOT_RESTOCK_UNSEALED' },
          );
        }

        await customerReturnRepository.updateReturnLine(
          lineId,
          {
            condition_state: condition,
            disposition,
            disposition_notes: line.dispositionNotes ? String(line.dispositionNotes).trim() : null,
          },
          connection,
        );
      }

      await customerReturnRepository.updateReturn(
        id,
        {
          status: 'pending_inspection',
          inspected_by: userId,
          inspected_at: new Date(),
          notes: input?.notes ? String(input.notes).trim() : ret.notes,
        },
        connection,
      );

      await connection.commit();
      logger.info('Customer return inspected', { userId, customerReturnId: id });
      return customerReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async approveReturn(id, input, userId) {
    const outcome = String(input?.outcome || 'refund');
    const validOutcomes = ['refund', 'exchange', 'no_refund'];
    if (!validOutcomes.includes(outcome)) {
      throw new ValidationError('Validation failed', [
        { field: 'outcome', message: `Outcome must be one of: ${validOutcomes.join(', ')}` },
      ]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM customer_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Customer return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'pending_inspection' && ret.status !== 'submitted') {
        throw new AppError(`Cannot approve return with status "${ret.status}". Must be pending_inspection or submitted.`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      // Check return lines to ensure disposition has been chosen
      const lines = await customerReturnRepository.getReturnLines(id, connection);
      for (const line of lines) {
        if (!line.disposition || line.disposition === 'none') {
          // If no disposition set yet, default to quarantine for safe traceable workflow
          await customerReturnRepository.updateReturnLine(line.id, { disposition: 'quarantine' }, connection);
        }
      }

      // Calculate total return line values
      const totalLineVal = roundTo2(lines.reduce((acc, l) => acc + Number(l.line_total), 0));
      let refundAmt = totalLineVal;
      if (outcome === 'no_refund') {
        refundAmt = 0;
      } else if (input?.refundAmount !== undefined) {
        const reqAmt = Number(input.refundAmount);
        if (Number.isFinite(reqAmt) && reqAmt >= 0 && reqAmt <= totalLineVal) {
          refundAmt = roundTo2(reqAmt);
        }
      }

      await customerReturnRepository.updateReturn(
        id,
        {
          status: 'approved',
          outcome,
          refund_amount: refundAmt,
          approved_by: userId,
          approved_at: new Date(),
          notes: input?.notes ? String(input.notes).trim() : ret.notes,
        },
        connection,
      );

      await connection.commit();
      logger.info('Customer return approved', { userId, customerReturnId: id, outcome, refundAmount: refundAmt });
      return customerReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async rejectReturn(id, input, userId) {
    const rejectionReason = typeof input?.rejectionReason === 'string' ? input.rejectionReason.trim() : '';
    if (!rejectionReason) {
      throw new ValidationError('Validation failed', [
        { field: 'rejectionReason', message: 'Rejection reason is mandatory' },
      ]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM customer_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Customer return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status === 'completed' || ret.status === 'cancelled' || ret.status === 'rejected') {
        throw new AppError(`Cannot reject return with status "${ret.status}"`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await customerReturnRepository.updateReturn(
        id,
        {
          status: 'rejected',
          rejection_reason: rejectionReason,
          approved_by: userId,
          approved_at: new Date(),
        },
        connection,
      );

      await connection.commit();
      logger.info('Customer return rejected', { userId, customerReturnId: id, rejectionReason });
      return customerReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async completeReturn(id, input, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Lock customer return row
      const [retRows] = await connection.query(
        'SELECT * FROM customer_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = retRows[0];
      if (!ret) {
        throw new AppError('Customer return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      // Idempotency: if already completed, return without error
      if (ret.status === 'completed') {
        await connection.rollback();
        return customerReturnService.getReturnById(id, userId);
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status !== 'approved') {
        throw new AppError(`Cannot complete customer return with status "${ret.status}". Must be approved.`, {
          statusCode: 409,
          code: 'RETURN_NOT_APPROVED',
        });
      }

      // Lock original sale
      const [saleRows] = await connection.query(
        'SELECT * FROM sales WHERE id = ? FOR UPDATE',
        [ret.sale_id],
      );
      const sale = saleRows[0];
      if (!sale) {
        throw new AppError('Original sale record not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });
      }

      const lines = await customerReturnRepository.getReturnLines(id, connection);

      // 1. Authoritative stock mutation via inventoryService
      const inventoryMutationLines = lines.map((l) => ({
        productId: l.product_id,
        batchId: l.batch_id,
        unitId: l.unit_id,
        storageLocationId: l.storage_location_id,
        quantity: l.quantity,
        conditionState: l.condition_state,
        disposition: l.disposition,
        dispositionNotes: l.disposition_notes,
      }));

      await inventoryService.disposeCustomerReturnStock({
        customerReturnId: ret.id,
        organizationId: ret.organization_id,
        branchId: ret.branch_id,
        warehouseId: ret.warehouse_id,
        lines: inventoryMutationLines,
        userId,
        connection,
      });

      // 2. Financial settlement handling
      let refundId = ret.refund_id;
      const targetRefundAmount = roundTo2(ret.refund_amount);

      if (ret.outcome === 'refund' && targetRefundAmount > 0) {
        const salePaidAmount = roundTo2(sale.paid_amount);

        // Fetch cumulative refunds already issued for this sale
        const [existingRefunds] = await connection.query(
          `SELECT IFNULL(SUM(r.amount), 0) AS total_refunded
           FROM refunds r
           JOIN payment_allocations pa ON pa.payment_id = r.payment_id
           WHERE pa.reference_type = 'sale' AND pa.reference_id = ? AND r.status = 'completed'
           FOR UPDATE`,
          [sale.id],
        );
        const alreadyRefundedOnSale = roundTo2(existingRefunds[0]?.total_refunded || 0);
        const remainingPaidEligibleForRefund = Math.max(0, roundTo2(salePaidAmount - alreadyRefundedOnSale));

        // Cash portion is capped at remaining actual paid amount
        const cashRefundAmount = Math.min(targetRefundAmount, remainingPaidEligibleForRefund);

        if (cashRefundAmount > 0) {
          // Find payment associated with this sale
          const [payments] = await connection.query(
            `SELECT p.*
             FROM payments p
             JOIN payment_allocations pa ON pa.payment_id = p.id
             WHERE pa.reference_type = 'sale' AND pa.reference_id = ?
               AND p.status IN ('completed', 'partially_refunded')
             ORDER BY p.id ASC
             FOR UPDATE`,
            [sale.id],
          );

          if (payments.length > 0) {
            const payment = payments[0];
            const refundNumber = await generateRefundNumber(ret.organization_id, connection);

            const [refundRes] = await connection.query(
              `INSERT INTO refunds (
                 organization_id, branch_id, refund_number, payment_id,
                 reference_type, reference_id, amount, reason, refund_method,
                 status, approved_by, created_by
               ) VALUES (?, ?, ?, ?, 'sale', ?, ?, ?, 'cash', 'completed', ?, ?)`,
              [
                ret.organization_id,
                ret.branch_id,
                refundNumber,
                payment.id,
                sale.id,
                cashRefundAmount,
                ret.reason || 'Customer return completed',
                userId,
                userId,
              ],
            );
            refundId = refundRes.insertId;

            // Update payment status
            const [pRefundRows] = await connection.query(
              "SELECT IFNULL(SUM(amount), 0) AS total_refunded FROM refunds WHERE payment_id = ? AND status = 'completed'",
              [payment.id],
            );
            const totalPaymentRefunded = roundTo2(pRefundRows[0]?.total_refunded || 0);
            const newPaymentStatus = totalPaymentRefunded >= roundTo2(payment.amount) - 0.000001 ? 'refunded' : 'partially_refunded';
            await connection.query('UPDATE payments SET status = ? WHERE id = ?', [newPaymentStatus, payment.id]);

            // Adjust sale paid_amount
            await connection.query(
              `UPDATE sales
               SET paid_amount = GREATEST(0, paid_amount - ?),
                   payment_status = CASE WHEN (paid_amount - ?) <= 0.000001 THEN 'unpaid' ELSE 'partially_paid' END
               WHERE id = ?`,
              [cashRefundAmount, cashRefundAmount, sale.id],
            );
          }
        }

        // 3. Handle credit sale / unpaid portion adjustment
        const unpaidDebtReduction = roundTo2(targetRefundAmount - cashRefundAmount);
        if (unpaidDebtReduction > 0) {
          // Find customer receivable for this sale
          const [recRows] = await connection.query(
            `SELECT * FROM customer_receivables WHERE reference_type = 'sale' AND reference_id = ? FOR UPDATE`,
            [sale.id],
          );
          if (recRows.length > 0) {
            const cr = recRows[0];
            const newBalance = Math.max(0, roundTo2(Number(cr.balance_amount) - unpaidDebtReduction));
            const newTotal = Math.max(0, roundTo2(Number(cr.total_amount) - unpaidDebtReduction));
            const newStatus = newBalance <= 0.000001 ? 'paid' : (Number(cr.paid_amount) > 0 ? 'partially_paid' : 'unpaid');

            await connection.query(
              'UPDATE customer_receivables SET balance_amount = ?, total_amount = ?, status = ? WHERE id = ?',
              [newBalance, newTotal, newStatus, cr.id],
            );
          }
        }
      }

      // Mark return completed
      await customerReturnRepository.updateReturn(
        id,
        {
          status: 'completed',
          refund_id: refundId,
        },
        connection,
      );

      await auditService.log({
        organizationId: ret.organization_id,
        branchId: ret.branch_id,
        actorUserId: userId,
        action: 'customer_return.completed',
        resourceType: 'customer_return',
        resourceId: id,
        resourceReference: ret.return_number,
        reason: 'Customer return completed with stock disposition and refund/receivable adjustment',
        details: { refundId, targetRefundAmount },
      }, connection);

      await connection.commit();

      logger.info('Customer return completed successfully', {
        userId,
        customerReturnId: id,
        refundId,
      });

      return customerReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async cancelReturn(id, input, userId) {
    const cancelledReason = typeof input?.reason === 'string' ? input.reason.trim() : '';
    if (!cancelledReason) {
      throw new ValidationError('Validation failed', [
        { field: 'reason', message: 'Cancellation reason is mandatory' },
      ]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM customer_returns WHERE id = ? FOR UPDATE',
        [id],
      );
      const ret = rows[0];
      if (!ret) {
        throw new AppError('Customer return not found', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, ret, orgIds)) {
        throw new AppError('You do not have access to this return', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (ret.status === 'completed' || ret.status === 'cancelled') {
        throw new AppError(`Cannot cancel customer return with status "${ret.status}"`, {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await customerReturnRepository.updateReturn(
        id,
        {
          status: 'cancelled',
          cancelled_reason: cancelledReason,
        },
        connection,
      );

      await connection.commit();
      logger.info('Customer return cancelled', { userId, customerReturnId: id, cancelledReason });
      return customerReturnService.getReturnById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },
};

export default customerReturnService;
