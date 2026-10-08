import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from '../services/authorizationService.js';
import inventoryService from '../services/inventoryService.js';
import goodsReceiptRepository from '../repositories/goodsReceiptRepository.js';
import { getPool } from '../database/pool.js';

const STATUS_TRANSITIONS = {
  draft: new Set(['receiving', 'cancelled']),
  receiving: new Set(['completed', 'discrepancy', 'cancelled']),
  discrepancy: new Set(['cancelled']),
  completed: new Set([]),
  cancelled: new Set([]),
};

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return { orgIds: [...scope.organizationIds], branchIds: [...scope.branchIds], warehouseIds: [...scope.warehouseIds] };
}

function canAccess(scopeSets, row) {
  return (
    scopeSets.orgIds.includes(Number(row.organization_id)) ||
    scopeSets.branchIds.includes(Number(row.branch_id)) ||
    scopeSets.warehouseIds.includes(Number(row.warehouse_id))
  );
}

const RECEIPT_NUMBER_PREFIX = 'GR';

async function generateReceiptNumber(organizationId) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${RECEIPT_NUMBER_PREFIX}-${organizationId}-${dateStr}-${rand}`;
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await getPool().query('SELECT id FROM goods_receipts WHERE organization_id = ? AND receipt_number = ? LIMIT 1', [organizationId, candidate]);
    if (rows.length === 0) return candidate;
  }
  throw new AppError('Could not allocate a receipt number, please retry', { statusCode: 500, code: 'RECEIPT_NUMBER_CONFLICT' });
}

async function list(userId, filters) {
  const sets = await getScopeSets(userId);
  return goodsReceiptRepository.list({
    ...filters,
    accessibleOrgIds: sets.orgIds,
    accessibleBranchIds: sets.branchIds,
    accessibleWarehouseIds: sets.warehouseIds,
  });
}

async function getById(id, userId) {
  const receipt = await goodsReceiptRepository.findById(id);
  if (!receipt) throw new AppError('Goods receipt not found', { statusCode: 404, code: 'GOODS_RECEIPT_NOT_FOUND' });
  const sets = await getScopeSets(userId);
  if (!canAccess(sets, receipt)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  const lines = await goodsReceiptRepository.getLines(id);
  return { ...receipt, lines };
}

/** Validate common header+line payload at draft creation. */
async function validateCreate({ organizationId, branchId, warehouseId, purchaseOrderId, receiptDate, lines }, userId) {
  const details = [];
  if (!Number.isInteger(Number(organizationId)) || Number(organizationId) <= 0) details.push({ field: 'organizationId', message: 'Required' });
  if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) details.push({ field: 'branchId', message: 'Required' });
  if (!Number.isInteger(Number(warehouseId)) || Number(warehouseId) <= 0) details.push({ field: 'warehouseId', message: 'Required' });
  if (!Number.isInteger(Number(purchaseOrderId)) || Number(purchaseOrderId) <= 0) details.push({ field: 'purchaseOrderId', message: 'Required' });
  if (!receiptDate || Number.isNaN(new Date(receiptDate).getTime())) details.push({ field: 'receiptDate', message: 'A valid receipt date is required' });
  if (!Array.isArray(lines) || lines.length === 0) details.push({ field: 'lines', message: 'At least one line is required' });
  if (details.length) throw new ValidationError('Validation failed', details);

  const [poRows] = await getPool().query('SELECT * FROM purchase_orders WHERE id = ? LIMIT 1', [Number(purchaseOrderId)]);
  const po = poRows[0];
  if (!po) throw new AppError('Purchase order not found', { statusCode: 404, code: 'PURCHASE_ORDER_NOT_FOUND' });
  if (po.organization_id !== Number(organizationId)) throw new ValidationError('Validation failed', [{ field: 'purchaseOrderId', message: 'PO belongs to a different organization' }]);
  if (po.branch_id !== Number(branchId)) throw new ValidationError('Validation failed', [{ field: 'purchaseOrderId', message: 'PO belongs to a different branch' }]);
  if (!['approved', 'partially_received'].includes(po.status)) {
    throw new AppError(`Purchase order is not in a receivable state (${po.status})`, { statusCode: 409, code: 'PO_NOT_RECEIVABLE' });
  }

  const [warehouseRows] = await getPool().query('SELECT * FROM warehouses WHERE id = ? LIMIT 1', [Number(warehouseId)]);
  const warehouse = warehouseRows[0];
  if (!warehouse) throw new AppError('Warehouse not found', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });
  if (warehouse.branch_id !== Number(branchId)) throw new ValidationError('Validation failed', [{ field: 'warehouseId', message: 'Warehouse belongs to a different branch' }]);

  for (const [index, line] of lines.entries()) {
    if (!Number.isInteger(Number(line.purchaseOrderLineId))) details.push({ field: `lines[${index}].purchaseOrderLineId`, message: 'Valid purchaseOrderLineId is required' });
    if (!(Number(line.receivedQuantity) > 0)) details.push({ field: `lines[${index}].receivedQuantity`, message: 'Received quantity must be positive' });
    if (typeof line.batchNumber !== 'string' || !line.batchNumber.trim()) details.push({ field: `lines[${index}].batchNumber`, message: 'Batch number is required' });
    if (!line.expiryDate || Number.isNaN(new Date(line.expiryDate).getTime())) details.push({ field: `lines[${index}].expiryDate`, message: 'Expiry date is required and must be valid' });
    if (!Number.isInteger(Number(line.storageLocationId))) details.push({ field: `lines[${index}].storageLocationId`, message: 'Valid storageLocationId is required' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);

  for (const line of lines) {
    const [polRows] = await getPool().query(
      'SELECT l.*, p.status AS product_status, u.status AS unit_status FROM purchase_order_lines l JOIN products p ON p.id = l.product_id JOIN units u ON u.id = l.unit_id WHERE l.id = ? LIMIT 1',
      [Number(line.purchaseOrderLineId)],
    );
    const pol = polRows[0];
    if (!pol) throw new ValidationError('Validation failed', [{ field: 'lines.purchaseOrderLineId', message: 'PO line not found' }]);
    if (pol.purchase_order_id !== Number(purchaseOrderId)) throw new ValidationError('Validation failed', [{ field: 'lines.purchaseOrderLineId', message: 'PO line does not belong to this PO' }]);
    line.productId = pol.product_id;
    line.unitId = pol.unit_id;
    line.orderedQuantity = Number(pol.ordered_quantity);
    if (pol.product_status !== 'active') throw new AppError('Product referenced by PO line is inactive', { statusCode: 409, code: 'PRODUCT_INACTIVE' });
    if (pol.unit_status !== 'active') throw new AppError('Unit referenced by PO line is inactive', { statusCode: 409, code: 'UNIT_INACTIVE' });

    const receivedSoFar = await goodsReceiptRepository.getReceivedByPoLine(pol.id);
    const remaining = line.orderedQuantity - receivedSoFar;
    if (line.receivedQuantity > remaining) {
      throw new ValidationError('Validation failed', [{ field: 'lines.receivedQuantity', message: `Received quantity exceeds remaining (${remaining}) for this PO line` }]);
    }

    const [locRows] = await getPool().query(
      'SELECT * FROM storage_locations WHERE id = ? LIMIT 1',
      [Number(line.storageLocationId)],
    );
    const loc = locRows[0];
    if (!loc) throw new AppError('Storage location not found', { statusCode: 404, code: 'STORAGE_LOCATION_NOT_FOUND' });
    if (loc.warehouse_id !== Number(warehouseId)) throw new ValidationError('Validation failed', [{ field: 'lines.storageLocationId', message: 'Storage location belongs to a different warehouse' }]);
    if (loc.status !== 'active') throw new AppError('Storage location is inactive', { statusCode: 409, code: 'STORAGE_LOCATION_INACTIVE' });
  }

  return { po };
}

async function create(payload, userId) {
  const { organizationId, branchId, warehouseId, purchaseOrderId, receiptDate, notes, lines } = payload;
  const { po } = await validateCreate(payload, userId);

  const sets = await getScopeSets(userId);
  const allowed = sets.orgIds.includes(Number(organizationId)) || sets.branchIds.includes(Number(branchId)) || sets.warehouseIds.includes(Number(warehouseId));
  if (!allowed) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });

  const receiptNumber = await generateReceiptNumber(organizationId);
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [res] = await connection.query(
      "INSERT INTO goods_receipts (organization_id, branch_id, warehouse_id, purchase_order_id, receipt_number, receipt_date, status, received_by, notes) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
      [Number(organizationId), Number(branchId), Number(warehouseId), Number(purchaseOrderId), receiptNumber, receiptDate, userId, notes ?? null],
    );
    const grId = res.insertId;
    for (const line of lines) {
      // eslint-disable-next-line no-await-in-loop
      await connection.query(
        'INSERT INTO goods_receipt_lines (goods_receipt_id, purchase_order_line_id, product_id, unit_id, ordered_quantity, received_quantity, batch_number, expiry_date, storage_location_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [grId, Number(line.purchaseOrderLineId), Number(line.productId), Number(line.unitId), Number(line.orderedQuantity), Number(line.receivedQuantity), line.batchNumber.trim(), line.expiryDate, Number(line.storageLocationId), line.notes ?? null],
      );
    }
    await connection.commit();
    return getById(grId, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateDraft(id, patch, userId) {
  const receipt = await getById(id, userId);
  if (receipt.status !== 'draft') {
    throw new AppError('Only draft receipts can be edited', { statusCode: 409, code: 'RECEIPT_NOT_DRAFT' });
  }
  if (patch.lines) {
    for (const line of patch.lines) {
      if (!(Number(line.receivedQuantity) > 0)) throw new ValidationError('Validation failed', [{ field: 'lines.receivedQuantity', message: 'Quantity must be positive' }]);
    }
    await getPool().query('DELETE FROM goods_receipt_lines WHERE goods_receipt_id = ?', [id]);
    for (const line of patch.lines) {
      // eslint-disable-next-line no-await-in-loop
      await getPool().query(
        'INSERT INTO goods_receipt_lines (goods_receipt_id, purchase_order_line_id, product_id, unit_id, ordered_quantity, received_quantity, batch_number, expiry_date, storage_location_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, Number(line.purchaseOrderLineId), Number(line.productId), Number(line.unitId), Number(line.orderedQuantity), Number(line.receivedQuantity), (line.batchNumber || '').trim(), line.expiryDate, Number(line.storageLocationId), line.notes ?? null],
      );
    }
  }
  if (patch.notes !== undefined) await getPool().query('UPDATE goods_receipts SET notes = ? WHERE id = ?', [patch.notes, id]);
  return getById(id, userId);
}

async function start(id, userId) {
  const receipt = await getById(id, userId);
  if (!STATUS_TRANSITIONS[receipt.status].has('receiving')) {
    throw new AppError(`Cannot move from ${receipt.status} to receiving`, { statusCode: 409, code: 'INVALID_GR_STATUS_TRANSITION' });
  }
  await getPool().query("UPDATE goods_receipts SET status = 'receiving' WHERE id = ?", [id]);
  return getById(id, userId);
}

async function cancel(id, userId) {
  const receipt = await getById(id, userId);
  if (!STATUS_TRANSITIONS[receipt.status].has('cancelled')) {
    throw new AppError(`Cannot cancel from ${receipt.status}`, { statusCode: 409, code: 'INVALID_GR_STATUS_TRANSITION' });
  }
  await getPool().query("UPDATE goods_receipts SET status = 'cancelled' WHERE id = ?", [id]);
  return getById(id, userId);
}

async function complete(id, userId) {
  const receipt = await goodsReceiptRepository.findById(id);
  if (!receipt) throw new AppError('Goods receipt not found', { statusCode: 404, code: 'GOODS_RECEIPT_NOT_FOUND' });
  const sets = await getScopeSets(userId);
  if (!canAccess(sets, receipt)) throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  if (!['receiving', 'draft'].includes(receipt.status)) {
    throw new AppError(`Cannot complete from ${receipt.status}`, { statusCode: 409, code: 'INVALID_GR_STATUS_TRANSITION' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock PO for concurrency safety while reading cumulative receipts.
    const [poRows] = await connection.query('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [receipt.purchase_order_id]);
    const po = poRows[0];
    if (!po) throw new AppError('Purchase order not found', { statusCode: 404, code: 'PURCHASE_ORDER_NOT_FOUND' });
    if (['cancelled', 'rejected'].includes(po.status)) {
      throw new AppError('Purchase order is not receivable', { statusCode: 409, code: 'PO_NOT_RECEIVABLE' });
    }
    if (po.status === 'fully_received') {
      throw new AppError('Purchase order is already fully received', { statusCode: 409, code: 'PO_FULLY_RECEIVED' });
    }

    const lines = await goodsReceiptRepository.getLines(id);
    if (lines.length === 0) throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Receipt has no lines' }]);

    for (const line of lines) {
      const receivedSoFar = await connection.query(
        `SELECT COALESCE(SUM(l.received_quantity), 0) AS total FROM goods_receipt_lines l
         JOIN goods_receipts g ON g.id = l.goods_receipt_id
         WHERE l.purchase_order_line_id = ? AND g.status = 'completed' AND g.id <> ?`,
        [line.purchase_order_line_id, id],
      );
      const already = Number(receivedSoFar[0][0].total);
      const ordered = Number(line.ordered_quantity);
      const received = Number(line.received_quantity);
      if (received <= 0) throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Each line must have a positive received quantity' }]);
      if (already + received > ordered) {
        throw new ValidationError('Validation failed', [{ field: 'lines', message: `Received quantity would exceed ordered (remaining ${ordered - already})` }]);
      }

      // Batch find-or-create (preserves existing expiry consistency rules)
      let effectiveBatchId;
      const [batchRows] = await connection.query(
        'SELECT * FROM batches WHERE organization_id = ? AND product_id = ? AND batch_number = ? LIMIT 1',
        [receipt.organization_id, line.product_id, line.batch_number.trim()],
      );
      if (batchRows.length > 0) {
        const b = batchRows[0];
        if (b.status !== 'active') throw new AppError('Batch is inactive', { statusCode: 409, code: 'BATCH_INACTIVE' });
        if (new Date(b.expiry_date).getTime() !== new Date(line.expiry_date).getTime()) {
          throw new ValidationError('Validation failed', [{ field: 'lines.expiryDate', message: 'Existing batch has a different expiry date' }]);
        }
        effectiveBatchId = b.id;
      } else {
        const [br] = await connection.query(
          'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date) VALUES (?, ?, ?, ?)',
          [receipt.organization_id, line.product_id, line.batch_number.trim(), line.expiry_date],
        );
        effectiveBatchId = br.insertId;
      }

      await inventoryService.receiveStockInternal({
        organizationId: receipt.organization_id,
        branchId: receipt.branch_id,
        warehouseId: receipt.warehouse_id,
        storageLocationId: line.storage_location_id,
        productId: line.product_id,
        batchId: effectiveBatchId,
        unitId: line.unit_id,
        quantity: received,
        movementType: 'purchase_receipt',
        referenceType: 'goods_receipt',
        referenceId: id,
        reason: line.notes ?? null,
        userId,
        connection,
      });
    }

    // Re-evaluate PO status from completed lines.
    const [lineAggRows] = await connection.query(
      `SELECT l.purchase_order_line_id, SUM(l.received_quantity) AS received
       FROM goods_receipt_lines l
       JOIN goods_receipts g ON g.id = l.goods_receipt_id
       WHERE g.status = 'completed' AND g.purchase_order_id = ?
       GROUP BY l.purchase_order_line_id`,
      [receipt.purchase_order_id],
    );
    const receivedByLine = new Map(lineAggRows.map((r) => [r.purchase_order_line_id, Number(r.received)]));
    // Include current receipt (not yet marked completed)
    for (const l of lines) {
      receivedByLine.set(l.purchase_order_line_id, (receivedByLine.get(l.purchase_order_line_id) || 0) + Number(l.received_quantity));
    }

    const [polRows] = await connection.query('SELECT * FROM purchase_order_lines WHERE purchase_order_id = ?', [receipt.purchase_order_id]);
    const allFull = polRows.every((pol) => (receivedByLine.get(pol.id) || 0) >= Number(pol.ordered_quantity));
    await connection.query("UPDATE purchase_orders SET status = ? WHERE id = ?", [allFull ? 'fully_received' : 'partially_received', receipt.purchase_order_id]);

    await connection.query("UPDATE goods_receipts SET status = 'completed' WHERE id = ?", [id]);
    await connection.commit();
    return getById(id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export default { list, getById, create, updateDraft, start, complete, cancel };
