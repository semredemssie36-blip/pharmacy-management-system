import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import saleRepository from '../repositories/saleRepository.js';
import dispensingRepository from '../repositories/dispensingRepository.js';
import receivableRepository from '../repositories/receivableRepository.js';
import paymentRepository from '../repositories/paymentRepository.js';
import { getPool } from '../database/pool.js';
import logger from '../utils/logger.js';

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

async function getAccessibleOrgIds(sets, connection) {
  const runner = connection || getPool();
  const orgIds = new Set(sets.orgIds);
  if (sets.branchIds.length > 0) {
    const [bRows] = await runner.query(
      `SELECT DISTINCT organization_id FROM branches WHERE id IN (${sets.branchIds.map(() => '?').join(',')})`,
      sets.branchIds,
    );
    bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
  }
  return orgIds;
}

function canAccess(scopeSets, row, orgIds) {
  if (scopeSets.orgIds.includes(Number(row.organization_id))) return true;
  if (row.branch_id && scopeSets.branchIds.includes(Number(row.branch_id))) return true;
  if (orgIds && orgIds.has(Number(row.organization_id))) return true;
  return false;
}

function roundTo2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'mobile_money'];
const REFUND_METHODS = ['cash', 'card', 'bank_transfer', 'mobile_money', 'credit_adjustment'];

async function generatePaymentNumber(organizationId, connection) {
  const runner = connection || getPool();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `PAY-${organizationId}-${dateStr}-${rand}`;
    const [rows] = await runner.query(
      'SELECT id FROM payments WHERE organization_id = ? AND payment_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `PAY-${organizationId}-${dateStr}-${Date.now().toString().slice(-6)}`;
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

export const paymentService = {
  async listPayments(filters, userId) {
    const sets = await getScopeSets(userId);
    return paymentRepository.listPayments({
      ...filters,
      accessibleOrgIds: sets.orgIds,
      accessibleBranchIds: sets.branchIds,
    });
  },

  async getPaymentById(id, userId) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw new AppError('Payment not found', { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!canAccess(sets, payment, orgIds)) {
      throw new AppError('You do not have access to this payment', { statusCode: 403, code: 'FORBIDDEN' });
    }

    payment.allocations = await paymentRepository.getAllocationsByPaymentId(id);
    payment.refunds = await paymentRepository.getRefundsByPaymentId(id);
    return payment;
  },

  async createPayment(input, userId) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'amount', message: 'Payment amount must be greater than zero' }]);
    }

    const paymentMethod = String(input.paymentMethod || '').toLowerCase();
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      throw new ValidationError('Validation failed', [{ field: 'paymentMethod', message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` }]);
    }

    const requestedStatus = input.status === 'pending' ? 'pending' : 'completed';
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let targetOrgId = null;
      let targetBranchId = input.branchId ? Number(input.branchId) : null;
      let targetCustomerId = input.customerId ? Number(input.customerId) : null;

      const referenceType = input.referenceType ? String(input.referenceType).toLowerCase() : null;
      const referenceId = input.referenceId ? Number(input.referenceId) : null;

      let saleRow = null;
      let dispensingRow = null;
      let receivableRow = null;

      if (referenceType === 'sale') {
        if (!referenceId) throw new ValidationError('Validation failed', [{ field: 'referenceId', message: 'Valid sale ID is required' }]);
        const [rows] = await connection.query(
          'SELECT id, organization_id, branch_id, warehouse_id, customer_id, sale_number, status, total_amount, paid_amount FROM sales WHERE id = ? FOR UPDATE',
          [referenceId],
        );
        saleRow = rows[0];
        if (!saleRow) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

        if (saleRow.status === 'cancelled' || saleRow.status === 'voided') {
          throw new AppError(`Cannot record payment against ${saleRow.status} sale`, { statusCode: 409, code: 'PAYMENT_NOT_ELIGIBLE' });
        }

        targetOrgId = saleRow.organization_id;
        targetBranchId = saleRow.branch_id;
        if (saleRow.customer_id) targetCustomerId = saleRow.customer_id;

        const currentPaid = roundTo2(saleRow.paid_amount || 0);
        const totalAmount = roundTo2(saleRow.total_amount);
        const outstanding = roundTo2(totalAmount - currentPaid);

        if (outstanding <= 0.000001) {
          throw new AppError('Sale is already fully settled', { statusCode: 409, code: 'PAYMENT_ALREADY_PROCESSED' });
        }

        if (roundTo2(amount) > outstanding) {
          throw new AppError(`Payment amount (${amount} ETB) exceeds outstanding balance (${outstanding} ETB)`, {
            statusCode: 400,
            code: 'PAYMENT_AMOUNT_INVALID',
          });
        }
      } else if (referenceType === 'dispensing') {
        if (!referenceId) throw new ValidationError('Validation failed', [{ field: 'referenceId', message: 'Valid dispensing ID is required' }]);
        const [rows] = await connection.query(
          'SELECT id, organization_id, branch_id, warehouse_id, dispensing_number, status, total_amount, paid_amount FROM dispensings WHERE id = ? FOR UPDATE',
          [referenceId],
        );
        dispensingRow = rows[0];
        if (!dispensingRow) throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });

        if (dispensingRow.status !== 'verified' && dispensingRow.status !== 'payment_pending') {
          throw new AppError('Dispensing must be verified by a pharmacist before payment', { statusCode: 409, code: 'PAYMENT_NOT_ELIGIBLE' });
        }

        targetOrgId = dispensingRow.organization_id;
        targetBranchId = dispensingRow.branch_id;

        const currentPaid = roundTo2(dispensingRow.paid_amount || 0);
        const totalAmount = roundTo2(dispensingRow.total_amount);
        const outstanding = roundTo2(totalAmount - currentPaid);

        if (outstanding <= 0.000001) {
          throw new AppError('Dispensing is already fully settled', { statusCode: 409, code: 'PAYMENT_ALREADY_PROCESSED' });
        }

        if (roundTo2(amount) > outstanding) {
          throw new AppError(`Payment amount (${amount} ETB) exceeds outstanding balance (${outstanding} ETB)`, {
            statusCode: 400,
            code: 'PAYMENT_AMOUNT_INVALID',
          });
        }
      } else if (referenceType === 'receivable') {
        if (!referenceId) throw new ValidationError('Validation failed', [{ field: 'referenceId', message: 'Valid receivable ID is required' }]);
        const [rows] = await connection.query(
          'SELECT id, organization_id, branch_id, customer_id, receivable_number, total_amount, paid_amount, balance_amount, status, reference_type, reference_id FROM customer_receivables WHERE id = ? FOR UPDATE',
          [referenceId],
        );
        receivableRow = rows[0];
        if (!receivableRow) throw new AppError('Receivable not found', { statusCode: 404, code: 'RECEIVABLE_NOT_FOUND' });

        if (receivableRow.status === 'paid' || receivableRow.status === 'cancelled') {
          throw new AppError(`Receivable is already ${receivableRow.status}`, { statusCode: 409, code: 'PAYMENT_ALREADY_PROCESSED' });
        }

        targetOrgId = receivableRow.organization_id;
        targetBranchId = receivableRow.branch_id;
        targetCustomerId = receivableRow.customer_id;

        const currentBalance = roundTo2(receivableRow.balance_amount);
        if (roundTo2(amount) > currentBalance) {
          throw new AppError(`Payment amount (${amount} ETB) exceeds receivable balance (${currentBalance} ETB)`, {
            statusCode: 400,
            code: 'PAYMENT_AMOUNT_INVALID',
          });
        }
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);

      if (targetOrgId && !orgIds.has(Number(targetOrgId))) {
        throw new AppError('You do not have access to this organization', { statusCode: 403, code: 'FORBIDDEN' });
      }
      if (targetBranchId && sets.branchIds.length > 0 && !sets.branchIds.includes(Number(targetBranchId)) && !sets.orgIds.includes(Number(targetOrgId))) {
        throw new AppError('You do not have access to this branch', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (!targetOrgId) {
        targetOrgId = sets.orgIds[0] || Array.from(orgIds)[0] || null;
      }
      if (!targetBranchId) {
        targetBranchId = sets.branchIds[0] || null;
        if (!targetBranchId && targetOrgId) {
          const [bRows] = await connection.query('SELECT id FROM branches WHERE organization_id = ? AND status = "active" ORDER BY id ASC LIMIT 1', [targetOrgId]);
          if (bRows[0]) targetBranchId = bRows[0].id;
        }
      }

      if (!targetOrgId || !targetBranchId) {
        throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Organization and branch are required' }]);
      }

      const paymentNumber = await generatePaymentNumber(targetOrgId, connection);

      const paymentId = await paymentRepository.createPayment(
        {
          organizationId: targetOrgId,
          branchId: targetBranchId,
          paymentNumber,
          paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
          paymentMethod,
          amount: roundTo2(amount),
          currency: input.currency || 'ETB',
          status: requestedStatus,
          customerId: targetCustomerId,
          externalReference: typeof input.externalReference === 'string' ? input.externalReference.trim() : null,
          notes: typeof input.notes === 'string' ? input.notes.trim() : null,
          recordedBy: userId,
        },
        connection,
      );

      // Create primary allocation if reference provided
      if (referenceType && referenceId) {
        await paymentRepository.createAllocation(
          {
            organizationId: targetOrgId,
            paymentId,
            referenceType,
            referenceId,
            amount: roundTo2(amount),
          },
          connection,
        );
      }

      // If multiple allocations provided
      if (Array.isArray(input.allocations) && input.allocations.length > 0) {
        let totalAllocated = 0;
        for (const alloc of input.allocations) {
          const allocAmt = roundTo2(alloc.amount);
          if (allocAmt <= 0) continue;
          totalAllocated += allocAmt;
          await paymentRepository.createAllocation(
            {
              organizationId: targetOrgId,
              paymentId,
              referenceType: alloc.referenceType,
              referenceId: alloc.referenceId,
              amount: allocAmt,
            },
            connection,
          );
        }
        if (totalAllocated > roundTo2(amount)) {
          throw new ValidationError('Validation failed', [{ field: 'allocations', message: 'Total allocations exceed payment amount' }]);
        }
      }

      // If payment is completed, apply settlement effects atomically!
      if (requestedStatus === 'completed') {
        if (saleRow) {
          const newPaid = roundTo2(Number(saleRow.paid_amount || 0) + amount);
          const isFullySettled = newPaid >= roundTo2(saleRow.total_amount) - 0.000001;

          if (isFullySettled) {
            // Deduct stock via FEFO if sale not yet completed
            if (saleRow.status !== 'completed') {
              const lines = await saleRepository.getLines(saleRow.id, connection);
              await inventoryService.allocateAndDeductFefoStock({
                organizationId: saleRow.organization_id,
                branchId: saleRow.branch_id,
                warehouseId: saleRow.warehouse_id,
                saleId: saleRow.id,
                lines,
                userId,
                connection,
              });
            }

            await connection.query(
              `UPDATE sales
               SET status = 'completed',
                   paid_amount = ?,
                   payment_status = 'paid'
               WHERE id = ?`,
              [newPaid, saleRow.id],
            );
          } else {
            // Partial payment: move status to payment_pending, inventory remains intact
            await connection.query(
              `UPDATE sales
               SET status = 'payment_pending',
                   paid_amount = ?,
                   payment_status = 'partially_paid'
               WHERE id = ?`,
              [newPaid, saleRow.id],
            );
          }
        } else if (dispensingRow) {
          const newPaid = roundTo2(Number(dispensingRow.paid_amount || 0) + amount);
          const isFullySettled = newPaid >= roundTo2(dispensingRow.total_amount) - 0.000001;

          if (isFullySettled) {
            // Finalize stock deduction from reserved inventory
            await inventoryService.finalizeDispensingStockDeduction({
              dispensingId: dispensingRow.id,
              userId,
              connection,
            });

            await connection.query(
              `UPDATE dispensings
               SET status = 'completed',
                   paid_amount = ?,
                   payment_status = 'paid'
               WHERE id = ?`,
              [newPaid, dispensingRow.id],
            );
          } else {
            // Partial payment: status remains payment_pending, reserved stock remains reserved
            await connection.query(
              `UPDATE dispensings
               SET status = 'payment_pending',
                   paid_amount = ?,
                   payment_status = 'partially_paid'
               WHERE id = ?`,
              [newPaid, dispensingRow.id],
            );
          }
        } else if (receivableRow) {
          const newPaid = roundTo2(Number(receivableRow.paid_amount) + amount);
          const newBalance = roundTo2(Math.max(0, Number(receivableRow.balance_amount) - amount));
          const newStatus = newBalance <= 0.000001 ? 'paid' : 'partially_paid';

          await connection.query(
            `UPDATE customer_receivables
             SET paid_amount = ?,
                 balance_amount = ?,
                 status = ?
             WHERE id = ?`,
            [newPaid, newBalance, newStatus, receivableRow.id],
          );

          // Update linked sale or dispensing paid amount if receivable is now paid
          if (receivableRow.reference_type === 'sale') {
            await connection.query(
              'UPDATE sales SET paid_amount = total_amount, payment_status = ? WHERE id = ?',
              [newStatus === 'paid' ? 'paid' : 'partially_paid', receivableRow.reference_id],
            );
          } else if (receivableRow.reference_type === 'dispensing') {
            await connection.query(
              'UPDATE dispensings SET paid_amount = total_amount, payment_status = ? WHERE id = ?',
              [newStatus === 'paid' ? 'paid' : 'partially_paid', receivableRow.reference_id],
            );
          }
        }
      }

      await connection.commit();

      logger.info('Payment recorded successfully', {
        userId,
        paymentId,
        paymentNumber,
        amount,
        status: requestedStatus,
        referenceType,
        referenceId,
      });

      return this.getPaymentById(paymentId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async verifyPayment(id, input, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [pRows] = await connection.query(
        'SELECT id, organization_id, branch_id, payment_number, amount, status FROM payments WHERE id = ? FOR UPDATE',
        [id],
      );
      const payment = pRows[0];
      if (!payment) {
        throw new AppError('Payment not found', { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, payment, orgIds)) {
        throw new AppError('You do not have access to this payment', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (payment.status !== 'pending') {
        throw new AppError(`Cannot verify payment with status "${payment.status}"`, { statusCode: 409, code: 'INVALID_STATUS' });
      }

      const verifiedAt = new Date();
      await paymentRepository.updatePayment(
        id,
        {
          status: 'completed',
          verifiedBy: userId,
          verifiedAt,
          notes: input?.notes ? String(input.notes).trim() : undefined,
        },
        connection,
      );

      // Settle linked transactions
      const allocations = await paymentRepository.getAllocationsByPaymentId(id, connection);
      for (const alloc of allocations) {
        const allocAmount = roundTo2(alloc.amount);
        if (alloc.reference_type === 'sale') {
          const [sRows] = await connection.query(
            'SELECT id, organization_id, branch_id, warehouse_id, status, total_amount, paid_amount FROM sales WHERE id = ? FOR UPDATE',
            [alloc.reference_id],
          );
          const sale = sRows[0];
          if (sale) {
            const newPaid = roundTo2(Number(sale.paid_amount || 0) + allocAmount);
            const isFullySettled = newPaid >= roundTo2(sale.total_amount) - 0.000001;

            if (isFullySettled) {
              if (sale.status !== 'completed') {
                const lines = await saleRepository.getLines(sale.id, connection);
                await inventoryService.allocateAndDeductFefoStock({
                  organizationId: sale.organization_id,
                  branchId: sale.branch_id,
                  warehouseId: sale.warehouse_id,
                  saleId: sale.id,
                  lines,
                  userId,
                  connection,
                });
              }
              await connection.query(
                "UPDATE sales SET status = 'completed', paid_amount = ?, payment_status = 'paid' WHERE id = ?",
                [newPaid, sale.id],
              );
            } else {
              await connection.query(
                "UPDATE sales SET status = 'payment_pending', paid_amount = ?, payment_status = 'partially_paid' WHERE id = ?",
                [newPaid, sale.id],
              );
            }
          }
        } else if (alloc.reference_type === 'dispensing') {
          const [dRows] = await connection.query(
            'SELECT id, organization_id, branch_id, warehouse_id, status, total_amount, paid_amount FROM dispensings WHERE id = ? FOR UPDATE',
            [alloc.reference_id],
          );
          const dispensing = dRows[0];
          if (dispensing) {
            const newPaid = roundTo2(Number(dispensing.paid_amount || 0) + allocAmount);
            const isFullySettled = newPaid >= roundTo2(dispensing.total_amount) - 0.000001;

            if (isFullySettled) {
              await inventoryService.finalizeDispensingStockDeduction({
                dispensingId: dispensing.id,
                userId,
                connection,
              });
              await connection.query(
                "UPDATE dispensings SET status = 'completed', paid_amount = ?, payment_status = 'paid' WHERE id = ?",
                [newPaid, dispensing.id],
              );
            } else {
              await connection.query(
                "UPDATE dispensings SET status = 'payment_pending', paid_amount = ?, payment_status = 'partially_paid' WHERE id = ?",
                [newPaid, dispensing.id],
              );
            }
          }
        } else if (alloc.reference_type === 'receivable') {
          const [rRows] = await connection.query(
            'SELECT id, total_amount, paid_amount, balance_amount, status FROM customer_receivables WHERE id = ? FOR UPDATE',
            [alloc.reference_id],
          );
          const cr = rRows[0];
          if (cr) {
            const newPaid = roundTo2(Number(cr.paid_amount) + allocAmount);
            const newBalance = roundTo2(Math.max(0, Number(cr.balance_amount) - allocAmount));
            const newStatus = newBalance <= 0.000001 ? 'paid' : 'partially_paid';

            await connection.query(
              'UPDATE customer_receivables SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
              [newPaid, newBalance, newStatus, cr.id],
            );
          }
        }
      }

      await connection.commit();

      logger.info('Payment verified', { userId, paymentId: id });
      return this.getPaymentById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async cancelPayment(id, input, userId) {
    const reason = typeof input?.cancellationReason === 'string'
      ? input.cancellationReason.trim()
      : (typeof input?.reason === 'string' ? input.reason.trim() : '');
    if (!reason) {
      throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Cancellation reason is required' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [pRows] = await connection.query(
        'SELECT id, organization_id, branch_id, status FROM payments WHERE id = ? FOR UPDATE',
        [id],
      );
      const payment = pRows[0];
      if (!payment) {
        throw new AppError('Payment not found', { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, payment, orgIds)) {
        throw new AppError('You do not have access to this payment', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (payment.status !== 'pending') {
        throw new AppError('Only pending payments can be cancelled; completed payments must be refunded', {
          statusCode: 409,
          code: 'INVALID_STATUS',
        });
      }

      await paymentRepository.updatePayment(
        id,
        {
          status: 'cancelled',
          cancelledBy: userId,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
        connection,
      );

      await connection.commit();

      logger.info('Payment cancelled', { userId, paymentId: id, reason });
      return this.getPaymentById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async refundPayment(id, input, userId) {
    const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
    if (!reason) {
      throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Refund reason is mandatory' }]);
    }

    const refundAmount = Number(input.amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'amount', message: 'Refund amount must be greater than zero' }]);
    }

    const refundMethod = String(input.refundMethod || 'cash').toLowerCase();
    if (!REFUND_METHODS.includes(refundMethod)) {
      throw new ValidationError('Validation failed', [{ field: 'refundMethod', message: `Refund method must be one of: ${REFUND_METHODS.join(', ')}` }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [pRows] = await connection.query(
        'SELECT id, organization_id, branch_id, payment_number, amount, status FROM payments WHERE id = ? FOR UPDATE',
        [id],
      );
      const payment = pRows[0];
      if (!payment) {
        throw new AppError('Payment not found', { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, payment, orgIds)) {
        throw new AppError('You do not have access to this payment', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (payment.status !== 'completed' && payment.status !== 'partially_refunded') {
        throw new AppError(`Cannot refund payment with status "${payment.status}"`, { statusCode: 409, code: 'PAYMENT_NOT_ELIGIBLE' });
      }

      // Check cumulative refunds against original payment
      const [rRows] = await connection.query(
        "SELECT IFNULL(SUM(amount), 0) AS total_refunded FROM refunds WHERE payment_id = ? AND status = 'completed' FOR UPDATE",
        [id],
      );
      const alreadyRefunded = roundTo2(rRows[0]?.total_refunded || 0);
      const maxRefundable = roundTo2(Number(payment.amount) - alreadyRefunded);

      if (roundTo2(refundAmount) > maxRefundable) {
        throw new AppError(
          `Refund amount (${refundAmount} ETB) exceeds eligible remaining paid amount (${maxRefundable} ETB)`,
          { statusCode: 400, code: 'REFUND_EXCEEDS_PAID_AMOUNT' },
        );
      }

      // Find primary allocation to link refund
      const allocations = await paymentRepository.getAllocationsByPaymentId(id, connection);
      const primaryAlloc = allocations[0] || { reference_type: 'sale', reference_id: 0 };

      const refundNumber = await generateRefundNumber(payment.organization_id, connection);
      const refundId = await paymentRepository.createRefund(
        {
          organizationId: payment.organization_id,
          branchId: payment.branch_id,
          refundNumber,
          paymentId: payment.id,
          referenceType: primaryAlloc.reference_type,
          referenceId: primaryAlloc.reference_id,
          amount: roundTo2(refundAmount),
          reason,
          refundMethod,
          externalReference: input?.externalReference ? String(input.externalReference).trim() : null,
          status: 'completed',
          approvedBy: userId,
          createdBy: userId,
        },
        connection,
      );

      // Update payment status
      const totalRefundedNow = roundTo2(alreadyRefunded + refundAmount);
      const newPaymentStatus = totalRefundedNow >= roundTo2(payment.amount) - 0.000001 ? 'refunded' : 'partially_refunded';

      await connection.query('UPDATE payments SET status = ? WHERE id = ?', [newPaymentStatus, payment.id]);

      // Adjust linked transaction paid amount
      for (const alloc of allocations) {
        if (alloc.reference_type === 'sale') {
          await connection.query(
            `UPDATE sales
             SET paid_amount = GREATEST(0, paid_amount - ?),
                 payment_status = CASE WHEN (paid_amount - ?) <= 0.000001 THEN 'unpaid' ELSE 'partially_paid' END
             WHERE id = ?`,
            [refundAmount, refundAmount, alloc.reference_id],
          );
        } else if (alloc.reference_type === 'dispensing') {
          await connection.query(
            `UPDATE dispensings
             SET paid_amount = GREATEST(0, paid_amount - ?),
                 payment_status = CASE WHEN (paid_amount - ?) <= 0.000001 THEN 'unpaid' ELSE 'partially_paid' END
             WHERE id = ?`,
            [refundAmount, refundAmount, alloc.reference_id],
          );
        } else if (alloc.reference_type === 'receivable') {
          await connection.query(
            `UPDATE customer_receivables
             SET paid_amount = GREATEST(0, paid_amount - ?),
                 balance_amount = balance_amount + ?,
                 status = CASE WHEN (paid_amount - ?) <= 0.000001 THEN 'unpaid' ELSE 'partially_paid' END
             WHERE id = ?`,
            [refundAmount, refundAmount, refundAmount, alloc.reference_id],
          );
        }
      }

      await connection.commit();

      logger.info('Refund processed successfully', {
        userId,
        paymentId: payment.id,
        refundId,
        refundNumber,
        amount: refundAmount,
      });

      return {
        payment: await this.getPaymentById(payment.id, userId),
        refund: {
          id: refundId,
          refundNumber,
          amount: refundAmount,
          reason,
          refundMethod,
        },
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async getPaymentReceipt(id, userId) {
    const payment = await this.getPaymentById(id, userId);

    const pool = getPool();
    const [bRows] = await pool.query(
      'SELECT b.name AS branch_name, b.code AS branch_code, o.name AS organization_name FROM branches b JOIN organizations o ON o.id = b.organization_id WHERE b.id = ? LIMIT 1',
      [payment.branch_id],
    );
    const branchInfo = bRows[0] || {};

    return {
      payment,
      organizationName: branchInfo.organization_name || 'EthioCodes Pharmacy ERP',
      branchName: branchInfo.branch_name || 'Main Branch',
      branchAddress: '',
      branchTelephone: '',
      cashier: payment.recorded_by_name || 'Cashier',
      timestamp: payment.payment_date,
      totalAmount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.payment_method,
      status: payment.status,
      allocations: payment.allocations,
      refunds: payment.refunds,
    };
  },
};

export default paymentService;
