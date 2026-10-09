import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import saleRepository from '../repositories/saleRepository.js';
import productRepository from '../repositories/productRepository.js';
import paymentRepository from '../repositories/paymentRepository.js';
import approvalRepository from '../repositories/approvalRepository.js';
import { getPool } from '../database/pool.js';

const STATUS_TRANSITIONS = {
  draft: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['payment_pending', 'completed', 'cancelled']),
  payment_pending: new Set(['completed', 'cancelled']),
  completed: new Set(['voided']),
  cancelled: new Set([]),
  voided: new Set([]),
};

const MAX_STANDARD_DISCOUNT_PERCENT = 15.0; // Standard cashier discount limit

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

function canAccess(scopeSets, row) {
  return (
    scopeSets.orgIds.includes(Number(row.organization_id)) ||
    scopeSets.branchIds.includes(Number(row.branch_id)) ||
    scopeSets.warehouseIds.includes(Number(row.warehouse_id))
  );
}

function roundTo2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

const SALE_NUMBER_PREFIX = 'SALE';

async function generateSaleNumber(organizationId) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${SALE_NUMBER_PREFIX}-${organizationId}-${dateStr}-${rand}`;
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await getPool().query('SELECT id FROM sales WHERE organization_id = ? AND sale_number = ? LIMIT 1', [organizationId, candidate]);
    if (rows.length === 0) return candidate;
  }
  throw new AppError('Could not allocate a sale number, please retry', { statusCode: 500, code: 'SALE_NUMBER_CONFLICT' });
}

async function validateAndResolveWarehouse(branchId, warehouseId, organizationId) {
  const pool = getPool();
  if (warehouseId) {
    const [wRows] = await pool.query('SELECT id, branch_id, status FROM warehouses WHERE id = ? LIMIT 1', [warehouseId]);
    const w = wRows[0];
    if (!w) throw new AppError('Warehouse does not exist', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });
    if (w.branch_id !== Number(branchId)) {
      throw new ValidationError('Validation failed', [{ field: 'warehouseId', message: 'Warehouse does not belong to the selected branch' }]);
    }
    if (w.status !== 'active') {
      throw new AppError('Inactive warehouses cannot be used for sales', { statusCode: 409, code: 'WAREHOUSE_INACTIVE' });
    }
    return Number(w.id);
  }

  // Auto-resolve first active warehouse of the branch
  const [activeRows] = await pool.query("SELECT id FROM warehouses WHERE branch_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1", [branchId]);
  if (activeRows.length === 0) {
    throw new AppError('No active warehouse found for the selected branch', { statusCode: 409, code: 'NO_ACTIVE_WAREHOUSE' });
  }
  return Number(activeRows[0].id);
}

async function validateCustomer(customerId, organizationId) {
  if (!customerId) return null;
  const [cRows] = await getPool().query('SELECT id, organization_id, name, status FROM customers WHERE id = ? LIMIT 1', [customerId]);
  const cust = cRows[0];
  if (!cust) throw new AppError('Customer does not exist', { statusCode: 404, code: 'CUSTOMER_NOT_FOUND' });
  if (cust.organization_id !== Number(organizationId)) {
    throw new ValidationError('Validation failed', [{ field: 'customerId', message: 'Customer belongs to a different organization' }]);
  }
  if (cust.status !== 'active') {
    throw new AppError('Inactive customer cannot be used for new sales', { statusCode: 409, code: 'CUSTOMER_INACTIVE' });
  }
  return cust;
}

async function validateAndComputeLines(organizationId, branchId, warehouseId, lines, userId, saleDiscount = 0, targetSaleId = null) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ValidationError('Validation failed', [{ field: 'lines', message: 'A sale must have at least one line item' }]);
  }

  const pool = getPool();
  const processedLines = [];
  let subtotal = 0;
  let totalLineDiscount = 0;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const item = lines[idx];
    const prefix = `lines[${idx}]`;

    const productId = Number(item.productId);
    const unitId = Number(item.unitId);
    const quantity = Number(item.quantity);
    const lineDiscount = Number(item.discountAmount || 0);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new ValidationError('Validation failed', [{ field: `${prefix}.productId`, message: 'Valid productId is required' }]);
    }
    if (!Number.isInteger(unitId) || unitId <= 0) {
      throw new ValidationError('Validation failed', [{ field: `${prefix}.unitId`, message: 'Valid unitId is required' }]);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError('Validation failed', [{ field: `${prefix}.quantity`, message: 'Quantity must be a positive number' }]);
    }
    if (!Number.isFinite(lineDiscount) || lineDiscount < 0) {
      throw new ValidationError('Validation failed', [{ field: `${prefix}.discountAmount`, message: 'Discount cannot be negative' }]);
    }

    const [pRows] = await pool.query('SELECT id, organization_id, name, selling_price, status FROM products WHERE id = ? LIMIT 1', [productId]);
    const product = pRows[0];
    if (!product) throw new AppError(`Product ID ${productId} does not exist`, { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
    if (product.organization_id !== Number(organizationId)) {
      throw new ValidationError('Validation failed', [{ field: `${prefix}.productId`, message: 'Product belongs to a different organization' }]);
    }
    if (product.status !== 'active') {
      throw new AppError(`Product ${product.name} is inactive and cannot be sold`, { statusCode: 409, code: 'PRODUCT_INACTIVE' });
    }

    const [puRows] = await pool.query('SELECT unit_id, is_selling_unit FROM product_units WHERE product_id = ? AND unit_id = ? LIMIT 1', [productId, unitId]);
    if (puRows.length === 0) {
      // Check if unit belongs to org
      const [uRows] = await pool.query('SELECT id, organization_id, status FROM units WHERE id = ? LIMIT 1', [unitId]);
      if (uRows.length === 0 || uRows[0].organization_id !== Number(organizationId)) {
        throw new ValidationError('Validation failed', [{ field: `${prefix}.unitId`, message: 'Unit does not belong to product or organization' }]);
      }
    }

    // Determine unit price: server-authoritative
    let unitPrice = Number(product.selling_price || 0);
    if (unitPrice <= 0 && item.unitPrice !== undefined) {
      unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new ValidationError('Validation failed', [{ field: `${prefix}.unitPrice`, message: 'Unit price must be non-negative' }]);
      }
    } else if (item.unitPrice !== undefined && Number(item.unitPrice) > 0 && unitPrice === 0) {
      unitPrice = Number(item.unitPrice);
    }
    unitPrice = roundTo2(unitPrice);

    const lineSubtotal = roundTo2(quantity * unitPrice);
    if (lineDiscount > lineSubtotal) {
      throw new ValidationError('Validation failed', [{ field: `${prefix}.discountAmount`, message: 'Line discount cannot exceed line subtotal' }]);
    }
    const lineTotal = roundTo2(lineSubtotal - lineDiscount);

    subtotal += lineSubtotal;
    totalLineDiscount += lineDiscount;

    processedLines.push({
      productId,
      unitId,
      quantity,
      unitPrice,
      discountAmount: lineDiscount,
      lineTotal,
      notes: typeof item.notes === 'string' ? item.notes.trim() : null,
    });
  }

  subtotal = roundTo2(subtotal);
  totalLineDiscount = roundTo2(totalLineDiscount);

  const saleLevelDiscount = roundTo2(Number(saleDiscount) || 0);
  if (saleLevelDiscount < 0) {
    throw new ValidationError('Validation failed', [{ field: 'discountAmount', message: 'Discount cannot be negative' }]);
  }

  const overallDiscount = roundTo2(totalLineDiscount + saleLevelDiscount);
  if (overallDiscount > subtotal) {
    throw new ValidationError('Validation failed', [{ field: 'discountAmount', message: 'Total discount cannot exceed subtotal' }]);
  }

  // Validate discount authorization limit
  const discountPercent = subtotal > 0 ? (overallDiscount / subtotal) * 100 : 0;
  if (discountPercent > MAX_STANDARD_DISCOUNT_PERCENT) {
    const permissions = await authorizationService.getUserPermissions(userId);
    const hasAdminOverride = permissions.includes('*') || permissions.includes('approval.discount') || permissions.includes('sale.void');
    if (!hasAdminOverride) {
      let isApproved = false;
      if (targetSaleId) {
        const approvedReq = await approvalRepository.findApprovedRequestForTarget(
          organizationId,
          'sale_discount',
          'sale',
          targetSaleId,
        );
        if (approvedReq && (approvedReq.requested_value === null || Number(approvedReq.requested_value) >= roundTo2(discountPercent) || Number(approvedReq.requested_value) >= roundTo2(overallDiscount))) {
          isApproved = true;
        }
      }

      if (!isApproved) {
        throw new AppError(
          `Discount (${roundTo2(discountPercent)}%) exceeds standard cashier authorization limit (${MAX_STANDARD_DISCOUNT_PERCENT}%). Manager authorization required.`,
          { statusCode: 403, code: 'EXCESS_DISCOUNT_UNAUTHORIZED' },
        );
      }
    }
  }

  const totalAmount = roundTo2(subtotal - overallDiscount);

  return {
    lines: processedLines,
    subtotal,
    discountAmount: overallDiscount,
    totalAmount,
  };
}

async function listSales(userId, filters) {
  const sets = await getScopeSets(userId);
  return saleRepository.list({
    ...filters,
    accessibleOrgIds: sets.orgIds,
    accessibleBranchIds: sets.branchIds,
    accessibleWarehouseIds: sets.warehouseIds,
  });
}

async function getSaleById(id, userId) {
  const sale = await saleRepository.findById(id);
  if (!sale) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });
  const sets = await getScopeSets(userId);
  if (!canAccess(sets, sale)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  const lines = await saleRepository.getLines(id);
  const payments = await paymentRepository.getAllocationsByReference('sale', id);
  const refunds = await paymentRepository.getRefundsByReference('sale', id);
  return { ...sale, lines, payments, refunds };
}

async function createSale(input, userId) {
  const organizationId = Number(input.organizationId);
  const branchId = Number(input.branchId);

  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Valid organizationId is required' }]);
  }
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Valid branchId is required' }]);
  }

  const pool = getPool();
  const [bRows] = await pool.query('SELECT id, organization_id, status FROM branches WHERE id = ? LIMIT 1', [branchId]);
  const branch = bRows[0];
  if (!branch) throw new AppError('Branch does not exist', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  if (branch.organization_id !== organizationId) {
    throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Branch belongs to a different organization' }]);
  }
  if (branch.status !== 'active') {
    throw new AppError('Inactive branch cannot be used for sales', { statusCode: 409, code: 'BRANCH_INACTIVE' });
  }

  const sets = await getScopeSets(userId);
  const hasScope = sets.orgIds.includes(organizationId) || sets.branchIds.includes(branchId);
  if (!hasScope) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  const warehouseId = await validateAndResolveWarehouse(branchId, input.warehouseId, organizationId);
  const hasWarehouseScope = sets.orgIds.includes(organizationId) || sets.branchIds.includes(branchId) || sets.warehouseIds.includes(warehouseId);
  if (!hasWarehouseScope) {
    throw new AppError('You do not have access to this warehouse scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  if (input.customerId) {
    await validateCustomer(input.customerId, organizationId);
  }

  const { lines, subtotal, discountAmount, totalAmount } = await validateAndComputeLines(
    organizationId,
    branchId,
    warehouseId,
    input.lines,
    userId,
    input.discountAmount,
  );

  const saleNumber = await generateSaleNumber(organizationId);
  const saleDate = input.saleDate ? new Date(input.saleDate) : new Date();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const saleId = await saleRepository.createSale(
      {
        organizationId,
        branchId,
        warehouseId,
        customerId: input.customerId ? Number(input.customerId) : null,
        saleNumber,
        saleDate,
        status: 'draft',
        subtotal,
        discountAmount,
        totalAmount,
        currency: input.currency || 'ETB',
        notes: typeof input.notes === 'string' ? input.notes.trim() : null,
        createdBy: userId,
      },
      lines,
      connection,
    );

    await connection.commit();
    return getSaleById(saleId, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateSale(id, input, userId) {
  const existing = await saleRepository.findById(id);
  if (!existing) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

  if (existing.status !== 'draft') {
    throw new AppError('Only draft sales can be edited', { statusCode: 409, code: 'SALE_NOT_DRAFT' });
  }

  if (input.customerId) {
    await validateCustomer(input.customerId, existing.organization_id);
  }

  const existingLines = await saleRepository.getLines(id);
  const rawLines = input.lines || existingLines.map((l) => ({
    productId: l.product_id,
    unitId: l.unit_id,
    quantity: l.quantity,
    unitPrice: l.unit_price,
    discountAmount: l.discount_amount,
    notes: l.notes,
  }));

  const { lines, subtotal, discountAmount, totalAmount } = await validateAndComputeLines(
    existing.organization_id,
    existing.branch_id,
    existing.warehouse_id,
    rawLines,
    userId,
    input.discountAmount !== undefined ? input.discountAmount : existing.discount_amount,
    id,
  );

  const saleDate = input.saleDate ? new Date(input.saleDate) : existing.sale_date;

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await saleRepository.updateSale(
      id,
      {
        customerId: input.customerId !== undefined ? (input.customerId ? Number(input.customerId) : null) : existing.customer_id,
        saleDate,
        subtotal,
        discountAmount,
        totalAmount,
        currency: input.currency || existing.currency,
        notes: typeof input.notes === 'string' ? input.notes.trim() : existing.notes,
      },
      lines,
      connection,
    );

    await connection.commit();
    return getSaleById(id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function confirmSale(id, userId) {
  const existing = await saleRepository.findById(id);
  if (!existing) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

  if (!STATUS_TRANSITIONS[existing.status]?.has('confirmed')) {
    throw new AppError(`Cannot confirm sale with status "${existing.status}"`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
  }

  const lines = await saleRepository.getLines(id);
  if (lines.length === 0) {
    throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Cannot confirm a sale with no line items' }]);
  }

  // Pre-validate that stock is currently available
  for (const line of lines) {
    const avail = await inventoryService.getAvailableStockForProduct({
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      warehouseId: existing.warehouse_id,
      productId: line.product_id,
    });
    if (avail < Number(line.quantity)) {
      throw new AppError(`Insufficient available stock for product ${line.product_name} (available: ${avail}, requested: ${line.quantity})`, {
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
      });
    }
  }

  await saleRepository.updateStatus(id, 'confirmed');
  return getSaleById(id, userId);
}

async function movePaymentPending(id, userId) {
  const existing = await saleRepository.findById(id);
  if (!existing) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

  if (!STATUS_TRANSITIONS[existing.status]?.has('payment_pending')) {
    throw new AppError(`Cannot move sale with status "${existing.status}" to payment pending`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
  }

  await saleRepository.updateStatus(id, 'payment_pending');
  return getSaleById(id, userId);
}

/**
 * Task 10 — Complete Sale.
 * Atomically consumes inventory using FEFO, records sale_batch_allocations and stock_movements,
 * and sets status to 'completed'.
 */
async function completeSale(id, userId) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT id, organization_id, branch_id, warehouse_id, customer_id, sale_number, status, subtotal, discount_amount, total_amount, currency FROM sales WHERE id = ? FOR UPDATE',
      [id],
    );
    const sale = rows[0];
    if (!sale) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, sale)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

    if (sale.status === 'completed') {
      await connection.commit();
      return getSaleById(id, userId);
    }

    if (!STATUS_TRANSITIONS[sale.status]?.has('completed')) {
      throw new AppError(`Cannot complete sale with status "${sale.status}"`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
    }

    const lines = await saleRepository.getLines(id, connection);
    if (lines.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Cannot complete a sale with no line items' }]);
    }

    // Authoritative stock deduction through inventoryService
    await inventoryService.allocateAndDeductFefoStock({
      organizationId: sale.organization_id,
      branchId: sale.branch_id,
      warehouseId: sale.warehouse_id,
      saleId: sale.id,
      lines,
      userId,
      connection,
    });

    const paidAmount = Number(sale.paid_amount || 0) <= 0 ? roundTo2(sale.total_amount) : roundTo2(sale.paid_amount);
    const paymentStatus = sale.payment_status === 'unpaid' ? 'paid' : sale.payment_status;

    await connection.query(
      `UPDATE sales
       SET status = 'completed',
           paid_amount = ?,
           payment_status = ?
       WHERE id = ?`,
      [paidAmount, paymentStatus, id],
    );

    const approvedDiscountReq = await approvalRepository.findApprovedRequestForTarget(
      sale.organization_id,
      'sale_discount',
      'sale',
      sale.id,
      connection,
    );
    if (approvedDiscountReq && approvedDiscountReq.status === 'approved') {
      await approvalRepository.updateStatus(approvedDiscountReq.id, {
        status: 'executed',
        executedAt: new Date(),
      }, connection);
      await approvalRepository.recordHistory({
        approvalRequestId: approvedDiscountReq.id,
        action: 'executed',
        actorId: userId,
        notes: `Sale #${sale.sale_number} completed with authorized discount`,
      }, connection);
    }

    await connection.commit();
    return getSaleById(id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function cancelSale(id, reason, userId) {
  const existing = await saleRepository.findById(id);
  if (!existing) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

  if (!STATUS_TRANSITIONS[existing.status]?.has('cancelled')) {
    throw new AppError(`Cannot cancel sale with status "${existing.status}"`, { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
  }

  await saleRepository.updateStatus(id, 'cancelled', { cancelledReason: reason || null });
  return getSaleById(id, userId);
}

/**
 * Task 10 — Void Sale.
 * Reverses inventory consumption atomically via inventoryService.reverseSaleStock
 * and records status = 'voided'.
 */
async function voidSale(id, reason, userId) {
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Void reason is required' }]);
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT id, organization_id, branch_id, warehouse_id, status FROM sales WHERE id = ? FOR UPDATE',
      [id],
    );
    const sale = rows[0];
    if (!sale) throw new AppError('Sale not found', { statusCode: 404, code: 'SALE_NOT_FOUND' });

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, sale)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

    if (!STATUS_TRANSITIONS[sale.status]?.has('voided')) {
      throw new AppError(`Cannot void sale with status "${sale.status}". Only completed sales can be voided.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    // Reverse inventory consumption through inventoryService
    await inventoryService.reverseSaleStock({
      saleId: sale.id,
      userId,
      reason: reason.trim(),
      connection,
    });

    await saleRepository.updateStatus(id, 'voided', { voidReason: reason.trim() }, connection);

    await connection.commit();
    return getSaleById(id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Fast product & barcode search for POS.
 */
async function searchPosProducts(userId, { q, branchId, warehouseId, organizationId }) {
  const sets = await getScopeSets(userId);
  const pool = getPool();

  let targetBranchId = branchId ? Number(branchId) : sets.branchIds[0];
  let targetWarehouseId = warehouseId ? Number(warehouseId) : sets.warehouseIds[0];
  let targetOrgId = organizationId ? Number(organizationId) : sets.orgIds[0];

  if (targetBranchId && !targetOrgId) {
    const [bRows] = await pool.query('SELECT organization_id FROM branches WHERE id = ? LIMIT 1', [targetBranchId]);
    if (bRows.length > 0) targetOrgId = Number(bRows[0].organization_id);
  }

  const hasAccess = (targetOrgId && sets.orgIds.includes(targetOrgId)) ||
    (targetBranchId && sets.branchIds.includes(targetBranchId)) ||
    (targetWarehouseId && sets.warehouseIds.includes(targetWarehouseId));

  if (!hasAccess || !targetOrgId) {
    throw new AppError('You do not have access to this organization or branch.', { statusCode: 403, code: 'FORBIDDEN' });
  }
  const term = typeof q === 'string' ? q.trim() : '';

  let querySql = `
    SELECT p.id, p.organization_id, p.code, p.barcode, p.name, p.selling_price,
           p.prescription_classification, p.controlled_classification, p.antibiotic_classification,
           b.name AS brand_name, g.name AS generic_name, df.name AS dosage_form_name
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN generics g ON g.id = p.generic_id
    LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
    WHERE p.organization_id = ? AND p.status = 'active'
  `;
  const params = [targetOrgId];

  if (term) {
    querySql += `
      AND (
        p.barcode = ? OR
        p.code = ? OR
        p.name LIKE ? OR
        p.barcode LIKE ? OR
        p.code LIKE ? OR
        g.name LIKE ? OR
        b.name LIKE ?
      )
    `;
    const pct = `%${term}%`;
    params.push(term, term, pct, pct, pct, pct, pct);
  }

  querySql += ' ORDER BY (p.barcode = ?) DESC, (p.code = ?) DESC, p.name ASC LIMIT 25';
  params.push(term, term);

  const [products] = await pool.query(querySql, params);

  // Enrich with available stock & units
  const enriched = [];
  for (const prod of products) {
    const availableQuantity = await inventoryService.getAvailableStockForProduct({
      organizationId: targetOrgId,
      branchId: targetBranchId,
      warehouseId: targetWarehouseId,
      productId: prod.id,
    });

    const units = await productRepository.getUnits(prod.id);
    const isExactBarcode = term !== '' && prod.barcode === term;

    enriched.push({
      ...prod,
      selling_price: roundTo2(prod.selling_price),
      availableQuantity,
      units,
      isExactBarcode,
    });
  }

  return enriched;
}

/**
 * Structured receipt information.
 */
async function getReceiptData(id, userId) {
  const sale = await getSaleById(id, userId);
  return {
    saleNumber: sale.sale_number,
    saleDate: sale.sale_date,
    status: sale.status,
    branch: {
      id: sale.branch_id,
      name: sale.branch_name,
      code: sale.branch_code,
    },
    warehouse: {
      id: sale.warehouse_id,
      name: sale.warehouse_name,
      code: sale.warehouse_code,
    },
    cashier: {
      id: sale.created_by,
      name: sale.cashier_name,
      email: sale.cashier_email,
    },
    customer: sale.customer_id ? {
      id: sale.customer_id,
      name: sale.customer_name,
      phone: sale.customer_phone,
    } : {
      name: 'Walk-in Customer',
      phone: null,
    },
    currency: sale.currency,
    subtotal: sale.subtotal,
    discountAmount: sale.discount_amount,
    totalAmount: sale.total_amount,
    paidAmount: sale.paid_amount,
    paymentStatus: sale.payment_status,
    remainingBalance: roundTo2(Math.max(0, Number(sale.total_amount) - Number(sale.paid_amount || 0))),
    notes: sale.notes,
    voidReason: sale.void_reason,
    lines: sale.lines.map((l) => ({
      productId: l.product_id,
      productName: l.product_name,
      productCode: l.product_code,
      unitName: l.unit_name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      discountAmount: l.discount_amount,
      lineTotal: l.line_total,
      batches: (l.allocations || []).map((a) => ({
        batchNumber: a.batch_number,
        expiryDate: a.expiry_date,
        quantity: a.quantity,
      })),
    })),
  };
}

export default {
  listSales,
  getSaleById,
  createSale,
  updateSale,
  confirmSale,
  movePaymentPending,
  completeSale,
  cancelSale,
  voidSale,
  searchPosProducts,
  getReceiptData,
};
