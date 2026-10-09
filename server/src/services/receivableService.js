import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import receivableRepository from '../repositories/receivableRepository.js';
import saleRepository from '../repositories/saleRepository.js';
import dispensingRepository from '../repositories/dispensingRepository.js';
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

async function generateReceivableNumber(organizationId, connection) {
  const runner = connection || getPool();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `REC-${organizationId}-${dateStr}-${rand}`;
    const [rows] = await runner.query(
      'SELECT id FROM customer_receivables WHERE organization_id = ? AND receivable_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  return `REC-${organizationId}-${dateStr}-${Date.now().toString().slice(-6)}`;
}

export const receivableService = {
  async listReceivables(filters, userId) {
    const sets = await getScopeSets(userId);
    return receivableRepository.listReceivables({
      ...filters,
      accessibleOrgIds: sets.orgIds,
      accessibleBranchIds: sets.branchIds,
    });
  },

  async getReceivableById(id, userId) {
    const rec = await receivableRepository.findById(id);
    if (!rec) {
      throw new AppError('Receivable record not found', { statusCode: 404, code: 'RECEIVABLE_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!canAccess(sets, rec, orgIds)) {
      throw new AppError('You do not have access to this receivable', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const allocations = await paymentRepository.getAllocationsByReference('receivable', id);
    rec.allocations = allocations;
    return rec;
  },

  async getCustomerFinancialSummary(customerId, userId) {
    const pool = getPool();
    const [cRows] = await pool.query(
      'SELECT id, organization_id, code, name, customer_type, telephone, email, credit_limit, payment_terms, status FROM customers WHERE id = ? LIMIT 1',
      [customerId],
    );
    const customer = cRows[0];
    if (!customer) {
      throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    const orgIds = await getAccessibleOrgIds(sets);
    if (!orgIds.has(Number(customer.organization_id))) {
      throw new AppError('You do not have access to this customer', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const currentBalance = await receivableRepository.getCustomerBalance(customerId);
    const creditLimit = customer.credit_limit !== null ? Number(customer.credit_limit) : null;
    const availableCredit = creditLimit !== null ? roundTo2(Math.max(0, creditLimit - currentBalance)) : null;

    const receivables = await receivableRepository.getCustomerReceivables(customerId);
    const [paymentRows] = await pool.query(
      `SELECT p.id, p.payment_number, p.payment_date, p.payment_method, p.amount, p.status, p.external_reference
       FROM payments p
       WHERE p.customer_id = ? AND p.status = 'completed'
       ORDER BY p.id DESC
       LIMIT 50`,
      [customerId],
    );

    return {
      customer: {
        id: customer.id,
        organizationId: customer.organization_id,
        code: customer.code,
        name: customer.name,
        customerType: customer.customer_type,
        telephone: customer.telephone,
        email: customer.email,
        creditLimit,
        paymentTerms: customer.payment_terms,
        status: customer.status,
      },
      financialSummary: {
        creditLimit,
        outstandingBalance: roundTo2(currentBalance),
        availableCredit,
        hasCreditLimit: creditLimit !== null,
        isOverLimit: creditLimit !== null && currentBalance > creditLimit,
      },
      receivables,
      payments: paymentRows,
    };
  },

  async authorizeCreditSale({ saleId, customerId, dueDate, notes, authorizedOverride }, userId) {
    const targetCustomerId = Number(customerId);
    if (!Number.isInteger(targetCustomerId) || targetCustomerId <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'customerId', message: 'Valid customerId is required for credit sales' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Lock customer for update
      const [cRows] = await connection.query(
        'SELECT id, organization_id, code, name, credit_limit, payment_terms, status FROM customers WHERE id = ? FOR UPDATE',
        [targetCustomerId],
      );
      const customer = cRows[0];
      if (!customer) {
        throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
      }
      if (customer.status !== 'active') {
        throw new AppError('Inactive customer cannot purchase on credit', { statusCode: 409, code: 'CUSTOMER_INACTIVE' });
      }

      // Lock sale for update
      const [sRows] = await connection.query(
        'SELECT id, organization_id, branch_id, warehouse_id, customer_id, sale_number, status, total_amount, paid_amount FROM sales WHERE id = ? FOR UPDATE',
        [saleId],
      );
      const sale = sRows[0];
      if (!sale) {
        throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, sale, orgIds) || !orgIds.has(Number(customer.organization_id))) {
        throw new AppError('You do not have access to this transaction', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (['completed', 'cancelled', 'voided'].includes(sale.status)) {
        throw new AppError(`Cannot convert sale with status "${sale.status}" to credit`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
      }

      const totalAmount = roundTo2(sale.total_amount);
      const paidAmount = roundTo2(sale.paid_amount || 0);
      const proposedCredit = roundTo2(totalAmount - paidAmount);

      if (proposedCredit <= 0) {
        throw new AppError('Sale is already fully settled; cannot create credit obligation', { statusCode: 409, code: 'TRANSACTION_ALREADY_COMPLETED' });
      }

      // Calculate current authoritative outstanding balance
      const currentBalance = await receivableRepository.getCustomerBalanceForUpdate(targetCustomerId, connection);
      const projectedBalance = roundTo2(currentBalance + proposedCredit);

      if (customer.credit_limit !== null) {
        const creditLimit = Number(customer.credit_limit);
        if (projectedBalance > creditLimit) {
          // Check if user has permission to authorize credit sale override
          const userPermissions = await authorizationService.getUserPermissions(userId);
          const hasCreditAuth = userPermissions.includes('credit_sale.authorize') || userPermissions.includes('*');

          if (!hasCreditAuth || !authorizedOverride) {
            throw new AppError(
              `Credit limit exceeded. Current balance: ${currentBalance} ETB, Proposed: ${proposedCredit} ETB, Limit: ${creditLimit} ETB`,
              { statusCode: 409, code: 'CREDIT_LIMIT_EXCEEDED' },
            );
          }

          logger.info('Credit limit override authorized', {
            userId,
            customerId: targetCustomerId,
            creditLimit,
            currentBalance,
            proposedCredit,
            projectedBalance,
          });
        }
      }

      // Check if receivable already exists for this sale
      const [existingRecRows] = await connection.query(
        'SELECT id FROM customer_receivables WHERE organization_id = ? AND reference_type = "sale" AND reference_id = ? LIMIT 1',
        [sale.organization_id, sale.id],
      );
      if (existingRecRows.length > 0) {
        throw new AppError('A credit receivable already exists for this sale', { statusCode: 409, code: 'RECEIVABLE_ALREADY_EXISTS' });
      }

      const receivableNumber = await generateReceivableNumber(sale.organization_id, connection);
      const receivableId = await receivableRepository.createReceivable(
        {
          organizationId: sale.organization_id,
          branchId: sale.branch_id,
          customerId: targetCustomerId,
          receivableNumber,
          referenceType: 'sale',
          referenceId: sale.id,
          totalAmount: proposedCredit,
          paidAmount: 0,
          balanceAmount: proposedCredit,
          dueDate: dueDate ? new Date(dueDate) : null,
          status: 'unpaid',
          notes: notes || `Credit sale for ${sale.sale_number}`,
          createdBy: userId,
        },
        connection,
      );

      // Consume inventory via FEFO and complete the sale atomically
      const lines = await saleRepository.getLines(sale.id, connection);
      if (lines.length === 0) {
        throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Cannot complete a sale with no line items' }]);
      }

      await inventoryService.allocateAndDeductFefoStock({
        organizationId: sale.organization_id,
        branchId: sale.branch_id,
        warehouseId: sale.warehouse_id,
        saleId: sale.id,
        lines,
        userId,
        connection,
      });

      // Update sale status to completed, payment_status to credit, and assign customer
      await connection.query(
        `UPDATE sales
         SET status = 'completed',
             customer_id = ?,
             payment_status = 'credit'
         WHERE id = ?`,
        [targetCustomerId, sale.id],
      );

      await connection.commit();

      logger.info('Credit sale completed successfully', {
        userId,
        saleId: sale.id,
        receivableId,
        customerId: targetCustomerId,
        amount: proposedCredit,
      });

      return {
        sale: await saleRepository.findById(sale.id),
        receivable: await receivableRepository.findById(receivableId),
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async authorizeCreditDispensing({ dispensingId, customerId, dueDate, notes, authorizedOverride }, userId) {
    const targetCustomerId = Number(customerId);
    if (!Number.isInteger(targetCustomerId) || targetCustomerId <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'customerId', message: 'Valid customerId is required for credit dispensing' }]);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Lock customer for update
      const [cRows] = await connection.query(
        'SELECT id, organization_id, code, name, credit_limit, payment_terms, status FROM customers WHERE id = ? FOR UPDATE',
        [targetCustomerId],
      );
      const customer = cRows[0];
      if (!customer) {
        throw new AppError('Customer not found', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
      }
      if (customer.status !== 'active') {
        throw new AppError('Inactive customer cannot purchase on credit', { statusCode: 409, code: 'CUSTOMER_INACTIVE' });
      }

      // Lock dispensing for update
      const [dRows] = await connection.query(
        'SELECT id, organization_id, branch_id, warehouse_id, dispensing_number, status, total_amount, paid_amount FROM dispensings WHERE id = ? FOR UPDATE',
        [dispensingId],
      );
      const dispensing = dRows[0];
      if (!dispensing) {
        throw new AppError('Dispensing not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
      }

      const sets = await getScopeSets(userId);
      const orgIds = await getAccessibleOrgIds(sets, connection);
      if (!canAccess(sets, dispensing, orgIds) || !orgIds.has(Number(customer.organization_id))) {
        throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
      }

      if (dispensing.status !== 'verified' && dispensing.status !== 'payment_pending') {
        throw new AppError(`Cannot dispense on credit with status "${dispensing.status}"`, { statusCode: 409, code: 'INVALID_STATUS' });
      }

      const totalAmount = roundTo2(dispensing.total_amount);
      const paidAmount = roundTo2(dispensing.paid_amount || 0);
      const proposedCredit = roundTo2(totalAmount - paidAmount);

      if (proposedCredit <= 0) {
        throw new AppError('Dispensing is already fully settled', { statusCode: 409, code: 'TRANSACTION_ALREADY_COMPLETED' });
      }

      // Calculate current authoritative outstanding balance
      const currentBalance = await receivableRepository.getCustomerBalanceForUpdate(targetCustomerId, connection);
      const projectedBalance = roundTo2(currentBalance + proposedCredit);

      if (customer.credit_limit !== null) {
        const creditLimit = Number(customer.credit_limit);
        if (projectedBalance > creditLimit) {
          const userPermissions = await authorizationService.getUserPermissions(userId);
          const hasCreditAuth = userPermissions.includes('credit_sale.authorize') || userPermissions.includes('*');

          if (!hasCreditAuth || !authorizedOverride) {
            throw new AppError(
              `Credit limit exceeded. Current balance: ${currentBalance} ETB, Proposed: ${proposedCredit} ETB, Limit: ${creditLimit} ETB`,
              { statusCode: 409, code: 'CREDIT_LIMIT_EXCEEDED' },
            );
          }
        }
      }

      const receivableNumber = await generateReceivableNumber(dispensing.organization_id, connection);
      const receivableId = await receivableRepository.createReceivable(
        {
          organizationId: dispensing.organization_id,
          branchId: dispensing.branch_id,
          customerId: targetCustomerId,
          receivableNumber,
          referenceType: 'dispensing',
          referenceId: dispensing.id,
          totalAmount: proposedCredit,
          paidAmount: 0,
          balanceAmount: proposedCredit,
          dueDate: dueDate ? new Date(dueDate) : null,
          status: 'unpaid',
          notes: notes || `Credit dispensing for ${dispensing.dispensing_number}`,
          createdBy: userId,
        },
        connection,
      );

      // Finalize dispensing stock deduction atomically
      await inventoryService.finalizeDispensingStockDeduction({
        dispensingId: dispensing.id,
        userId,
        connection,
      });

      // Update dispensing status = completed, payment_status = credit
      await connection.query(
        `UPDATE dispensings
         SET status = 'completed',
             payment_status = 'credit'
         WHERE id = ?`,
        [dispensing.id],
      );

      await connection.commit();

      logger.info('Credit dispensing completed successfully', {
        userId,
        dispensingId: dispensing.id,
        receivableId,
        customerId: targetCustomerId,
        amount: proposedCredit,
      });

      return {
        dispensing: await dispensingRepository.findById(dispensing.id),
        receivable: await receivableRepository.findById(receivableId),
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },
};

export default receivableService;
