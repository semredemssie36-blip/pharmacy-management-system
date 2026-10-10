import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from '../services/authorizationService.js';
import notificationService from '../services/notificationService.js';
import purchaseOrderRepository from './purchaseOrderRepository.js';
import { getPool } from '../database/pool.js';

const EDITABLE_STATUSES = new Set(['draft', 'submitted']);

const LINE_STATUS = [
  ['pending_approval', 'approved', 'rejected', 'cancelled', 'partially_received', 'fully_received'],
];

const EDITABLE_LINES_STATUSES = new Set(['draft']);

async function getUserScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
  };
}

function visibleFor(userScopeSets, po) {
  return (
    userScopeSets.orgIds.includes(Number(po.organization_id)) ||
    userScopeSets.branchIds.includes(Number(po.branch_id))
  );
}

const ENUM_REJECT = (reason) => {
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Reason is required' }]);
  }
  return reason.trim();
};

async function validateLines(lines, organizationId) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ValidationError('Validation failed', [{ field: 'lines', message: 'At least one line is required' }]);
  }
  const details = [];
  return validateLineDetails(lines, organizationId, details);
}

async function validateLineDetails(lines, organizationId, details) {
  const validated = [];
  for (const [index, line] of lines.entries()) {
    const quantity = Number(line.quantity);
    const price = Number(line.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      details.push({ field: `lines[${index}].quantity`, message: 'Quantity must be a positive number' });
    }
    if (!Number.isFinite(price) || price < 0) {
      details.push({ field: `lines[${index}].unitPrice`, message: 'Unit price must be non-negative' });
    }
    if (!Number.isInteger(Number(line.productId))) {
      details.push({ field: `lines[${index}].productId`, message: 'Valid productId is required' });
    }
    if (!Number.isInteger(Number(line.unitId))) {
      details.push({ field: `lines[${index}].unitId`, message: 'Valid unitId is required' });
    }
    if (!Number.isInteger(Number(line.supplierId)) && false) { /* supplier on header */ }
  }
  if (details.length) throw new ValidationError('Validation failed', details);

  for (const line of lines) {
    validated.push({ quantity: Number(line.quantity), unitPrice: Number(line.unitPrice ?? 0), productId: Number(line.productId), unitId: Number(line.unitId), notes: line.notes ?? null });
  }

  const stockByProductUnit = new Map();
  for (const line of validated) {
    const [productRows] = await getPool().query('SELECT id, organization_id, status FROM products WHERE id = ? LIMIT 1', [line.productId]);
    const product = productRows[0];
    if (!product) throw new ValidationError('Validation failed', [{ field: 'lines.productId', message: 'Product does not exist' }]);
    if (product.organization_id !== Number(organizationId)) throw new ValidationError('Validation failed', [{ field: 'lines.productId', message: 'Product belongs to a different organization' }]);
    if (product.status !== 'active') throw new ValidationError('Validation failed', [{ field: 'lines.productId', message: 'Product is inactive' }]);

    const [unitRows] = await getPool().query('SELECT id, organization_id, status FROM units WHERE id = ? LIMIT 1', [line.unitId]);
    const unit = unitRows[0];
    if (!unit) throw new ValidationError('Validation failed', [{ field: 'lines.unitId', message: 'Unit does not exist' }]);
    if (unit.organization_id !== Number(organizationId)) throw new ValidationError('Validation failed', [{ field: 'lines.unitId', message: 'Unit belongs to a different organization' }]);
    if (unit.status !== 'active') throw new ValidationError('Validation failed', [{ field: 'lines.unitId', message: 'Unit is inactive' }]);

    const [mappingRows] = await getPool().query('SELECT 1 AS ok FROM product_units WHERE product_id = ? AND unit_id = ? LIMIT 1', [line.productId, line.unitId]);
    if (mappingRows.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'lines.unitId', message: 'Unit is not configured for this product' }]);
    }

    line.lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
    stockByProductUnit.set(`${line.productId}:${line.unitId}`, line);
  }
  return validated;
}

async function generatePoNumber(organizationId) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `PO-${organizationId}-${dateStr}-${rand}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await purchaseOrderRepository.findByPoNumber(organizationId, candidate);
    if (!exists) return candidate;
  }
  throw new AppError('Could not allocate a purchase order number, please retry', { statusCode: 500, code: 'PO_NUMBER_CONFLICT' });
}

async function list(userId, filters) {
  const sets = await getUserScopeSets(userId);
  return purchaseOrderRepository.list({ ...filters, accessibleOrgIds: sets.orgIds, accessibleBranchIds: sets.branchIds });
}

async function getById(id, userId) {
  const po = await purchaseOrderRepository.findById(id);
  if (!po) throw new AppError('Purchase order not found', { statusCode: 404, code: 'PURCHASE_ORDER_NOT_FOUND' });
  const sets = await getUserScopeSets(userId);
  if (!visibleFor(sets, po)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }
  const lines = await purchaseOrderRepository.getLines(id);
  return { ...po, lines };
}

async function create({ organizationId, branchId, supplierId, orderDate, expectedDeliveryDate, notes, currency }, lines, userId) {
  const details = [];
  if (!Number.isInteger(Number(organizationId)) || Number(organizationId) <= 0) details.push({ field: 'organizationId', message: 'A valid organizationId is required' });
  if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) details.push({ field: 'branchId', message: 'A valid branchId is required' });
  if (!Number.isInteger(Number(supplierId)) || Number(supplierId) <= 0) details.push({ field: 'supplierId', message: 'A valid supplierId is required' });
  if (details.length) throw new ValidationError('Validation failed', details);

  const sets = await getUserScopeSets(userId);
  const branchAuthorized = sets.orgIds.includes(Number(organizationId)) || sets.branchIds.includes(Number(branchId));
  if (!branchAuthorized) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

  const [supplier] = await getPool().query('SELECT id, organization_id, status FROM suppliers WHERE id = ? LIMIT 1', [Number(supplierId)]);
  if (!supplier[0]) throw new AppError('Supplier does not exist', { statusCode: 404, code: 'SUPPLIER_NOT_FOUND' });
  if (supplier[0].organization_id !== Number(organizationId)) throw new ValidationError('Validation failed', [{ field: 'supplierId', message: 'Supplier belongs to a different organization' }]);
  if (supplier[0].status !== 'active') throw new AppError('Supplier is inactive', { statusCode: 409, code: 'SUPPLIER_INACTIVE' });

  const [branchRows] = await getPool().query('SELECT id, organization_id, status FROM branches WHERE id = ? LIMIT 1', [Number(branchId)]);
  const branch = branchRows[0];
  if (!branch) throw new AppError('Branch does not exist', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  if (branch.organization_id !== Number(organizationId)) throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Branch belongs to a different organization' }]);
  if (branch.status !== 'active') throw new AppError('Branch is inactive', { statusCode: 409, code: 'BRANCH_INACTIVE' });

  const validatedLines = await validateLines(lines, organizationId);
  const total = validatedLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const poNumber = await generatePoNumber(organizationId);

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      "INSERT INTO purchase_orders (organization_id, branch_id, supplier_id, po_number, order_date, expected_delivery_date, status, currency, notes, total_amount, created_by) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
      [
        Number(organizationId),
        Number(branchId),
        Number(supplierId),
        poNumber,
        orderDate || new Date(),
        expectedDeliveryDate || null,
        currency || 'ETB',
        notes ?? null,
        total,
        userId,
      ],
    );
    const poId = result.insertId;
    for (const line of validatedLines) {
      // eslint-disable-next-line no-await-in-loop
      await connection.query(
        'INSERT INTO purchase_order_lines (purchase_order_id, product_id, unit_id, ordered_quantity, unit_price, line_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [poId, line.productId, line.unitId, line.quantity, line.unitPrice, line.lineTotal, line.notes],
      );
    }
    await connection.commit();
    return getById(poId, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateDraft(id, { branchId, supplierId, orderDate, expectedDeliveryDate, notes, currency, lines }, userId) {
  const po = await getById(id, userId);
  if (po.status !== 'draft') {
    throw new AppError('Only draft purchase orders can be edited', { statusCode: 409, code: 'PO_NOT_DRAFT' });
  }
  // Protect core fields: supplier/org/branch invariants cannot be changed after creation without cancelling + recreating.
  if (supplierId !== undefined && Number(supplierId) !== po.supplier_id) {
    throw new AppError('Supplier cannot be changed on an existing purchase order; cancel and create a new one', { statusCode: 409, code: 'PO_SUPPLIER_IMMUTABLE' });
  }
  if (branchId !== undefined && Number(branchId) !== po.branch_id) {
    throw new AppError('Branch cannot be changed on an existing purchase order; cancel and create a new one', { statusCode: 409, code: 'PO_BRANCH_IMMUTABLE' });
  }

  const details = [];
  if (orderDate !== undefined && Number.isNaN(new Date(orderDate).getTime())) details.push({ field: 'orderDate', message: 'Invalid date' });
  if (expectedDeliveryDate !== undefined && expectedDeliveryDate !== null && Number.isNaN(new Date(expectedDeliveryDate).getTime())) {
    details.push({ field: 'expectedDeliveryDate', message: 'Invalid date' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);

  let computedLines;
  if (lines !== undefined) {
    computedLines = await validateLines(lines, po.organization_id);
  }

  const total = computedLines
    ? computedLines.reduce((sum, l) => sum + l.lineTotal, 0)
    : po.total_amount;

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE purchase_orders SET order_date = ?, expected_delivery_date = ?, notes = ?, currency = ?, total_amount = ? WHERE id = ?',
      [orderDate || po.order_date, expectedDeliveryDate !== undefined ? expectedDeliveryDate : po.expected_delivery_date, notes !== undefined ? notes : po.notes, currency ?? po.currency, total, id],
    );
    if (computedLines) {
      await connection.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = ?', [id]);
      for (const line of computedLines) {
        // eslint-disable-next-line no-await-in-loop
        await connection.query(
          'INSERT INTO purchase_order_lines (purchase_order_id, product_id, unit_id, ordered_quantity, unit_price, line_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, line.productId, line.unitId, line.quantity, line.unitPrice, line.lineTotal, line.notes],
        );
      }
    }
    await connection.commit();
    return getById(id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function markFinalStatus(id, target, { reason, statusPrevious } = {}, userId) {
  const po = await purchaseOrderRepository.findById(id);
  if (!po) throw new AppError('Purchase order not found', { statusCode: 404, code: 'PURCHASE_ORDER_NOT_FOUND' });
  const sets = await getUserScopeSets(userId);
  if (!visibleFor(sets, po)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  if (!statusPrevious.includes(po.status)) {
    throw new AppError(`Cannot move from ${po.status} to ${target}`, { statusCode: 409, code: 'INVALID_PO_STATUS_TRANSITION' });
  }

  if (target === 'rejected') {
    await getPool().query("UPDATE purchase_orders SET status = ?, rejection_reason = ? WHERE id = ?", [target, reason || null, id]);
  } else if (target === 'cancelled') {
    await getPool().query("UPDATE purchase_orders SET status = ?, cancelled_reason = ? WHERE id = ?", [target, reason || null, id]);
  } else {
    await getPool().query('UPDATE purchase_orders SET status = ? WHERE id = ?', [target, id]);
  }
  return getById(id, userId);
}

async function submit(id, userId) {
  const result = await markFinalStatus(id, 'pending_approval', { statusPrevious: ['draft', 'submitted'] }, userId);
  await notificationService.notifyByPermission({
    organizationId: result.organization_id,
    branchId: result.branch_id,
    permission: 'purchase_order.approve',
    excludeUserIds: [userId],
    type: 'purchase_order_pending',
    title: `Purchase Order Awaiting Approval: ${result.po_number}`,
    message: `PO ${result.po_number} submitted for approval. Total: ${result.total_amount} ${result.currency}.`,
    severity: 'warning',
    resourceType: 'purchase_order',
    resourceId: result.id,
    resourceReference: result.po_number,
    actionUrl: `/procurement/purchase-orders/${result.id}`,
    dedupKey: `po:pending:${result.id}`,
  }).catch(() => {});
  return result;
}

async function approve(id, userId) {
  const result = await markFinalStatus(id, 'approved', { statusPrevious: ['pending_approval'] }, userId);
  if (result.created_by) {
    await notificationService.notifyUsers({
      userIds: [result.created_by],
      organizationId: result.organization_id,
      branchId: result.branch_id,
      type: 'purchase_order_decision',
      title: 'Purchase Order Approved',
      message: `PO ${result.po_number} was approved.`,
      severity: 'success',
      resourceType: 'purchase_order',
      resourceId: result.id,
      resourceReference: result.po_number,
      actionUrl: `/procurement/purchase-orders/${result.id}`,
      dedupKey: `po:approved:${result.id}`,
    }).catch(() => {});
  }
  return result;
}

async function reject(id, reason, userId) {
  const r = ENUM_REJECT(reason);
  const result = await markFinalStatus(id, 'rejected', { reason: r, statusPrevious: ['pending_approval'] }, userId);
  if (result.created_by) {
    await notificationService.notifyUsers({
      userIds: [result.created_by],
      organizationId: result.organization_id,
      branchId: result.branch_id,
      type: 'purchase_order_decision',
      title: 'Purchase Order Rejected',
      message: `PO ${result.po_number} was rejected. Reason: ${r}`,
      severity: 'danger',
      resourceType: 'purchase_order',
      resourceId: result.id,
      resourceReference: result.po_number,
      actionUrl: `/procurement/purchase-orders/${result.id}`,
      dedupKey: `po:rejected:${result.id}`,
    }).catch(() => {});
  }
  return result;
}

async function cancel(id, reason, userId) {
  const r = ENUM_REJECT(reason);
  return markFinalStatus(id, 'cancelled', { reason: r, statusPrevious: ['draft', 'submitted', 'pending_approval', 'approved', 'partially_received'] }, userId);
}

export default {
  list, getById, create, updateDraft, submit, approve, reject, cancel,
};
