import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryRepository from '../repositories/inventoryRepository.js';
import { getPool } from '../database/pool.js';

/**
 * Inventory service layer. All stock changes must go through this layer so
 * every quantity change commits with its stock movement atomically and
 * enforces structure validation + scope + negative-stock protection.
 */

const MOVEMENT_TYPES = [
  'opening_balance', 'purchase_receipt', 'sale', 'dispensing',
  'customer_return', 'supplier_return', 'transfer_in', 'transfer_out',
  'adjustment', 'damage', 'expiry', 'disposal', 'recall', 'other',
];

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

/** True if the row falls inside any of the user's org/branch/warehouse scopes. */
function allowed(scopeSets, row) {
  return (
    scopeSets.orgIds.includes(Number(row.organization_id)) ||
    scopeSets.branchIds.includes(Number(row.branch_id)) ||
    scopeSets.warehouseIds.includes(Number(row.warehouse_id))
  );
}

async function requireScopeOnRow(userId, row) {
  const scopeSets = await getScopeSets(userId);
  if (!allowed(scopeSets, row)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }
}

async function getProduct(productId) {
  const [rows] = await getPool().query('SELECT id, organization_id, code, name, status FROM products WHERE id = ? LIMIT 1', [productId]);
  return rows[0] || null;
}

async function getBranch(branchId) {
  const [rows] = await getPool().query('SELECT id, organization_id, name, code, status FROM branches WHERE id = ? LIMIT 1', [branchId]);
  return rows[0] || null;
}

async function getWarehouse(warehouseId) {
  const [rows] = await getPool().query('SELECT id, branch_id, name, code, status FROM warehouses WHERE id = ? LIMIT 1', [warehouseId]);
  return rows[0] || null;
}

async function getStorageLocation(locationId) {
  const [rows] = await getPool().query('SELECT id, warehouse_id, name, code, status FROM storage_locations WHERE id = ? LIMIT 1', [locationId]);
  return rows[0] || null;
}

async function getUnit(unitId) {
  const [rows] = await getPool().query('SELECT id, organization_id, name, code, status FROM units WHERE id = ? LIMIT 1', [unitId]);
  return rows[0] || null;
}

async function getBatch(batchId) {
  const [rows] = await getPool().query('SELECT id, organization_id, product_id, batch_number, expiry_date, status FROM batches WHERE id = ? LIMIT 1', [batchId]);
  return rows[0] || null;
}

function validateQuantity(quantity) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'quantity', message: 'Quantity must be a positive number' }]);
  }
  return qty;
}

function validateExpiry(expiryDate) {
  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('Validation failed', [{ field: 'expiryDate', message: 'Expiry date is required and must be valid' }]);
  }
  return date;
}

/**
 * Opening balance — the only public stock-changing API at this stage.
 * Creates/attaches a batch if needed, upserts the 'available' inventory row,
 * and records an OPENING_BALANCE movement, all within one DB transaction.
 */
async function createOpeningBalance(input, userId) {
  const organizationId = Number(input.organizationId);
  const branchId = Number(input.branchId);
  const warehouseId = Number(input.warehouseId);
  const storageLocationId = Number(input.storageLocationId);
  const productId = Number(input.productId);
  const unitId = Number(input.unitId);

  const details = [];
  for (const [field, value] of Object.entries({ organizationId, branchId, warehouseId, storageLocationId, productId, unitId })) {
    if (!Number.isInteger(value) || value <= 0) details.push({ field, message: `Valid ${field} is required` });
  }
  if (input.batchId !== undefined && input.batchId !== null && (!Number.isInteger(Number(input.batchId)) || Number(input.batchId) <= 0)) {
    details.push({ field: 'batchId', message: 'batchId must be a positive integer' });
  }
  if (typeof input.batchNumber !== 'string' || !input.batchNumber.trim()) {
    if (input.batchId == null) details.push({ field: 'batchNumber', message: 'Batch number is required when batchId is not provided' });
  }
  if (input.batchId == null && input.expiryDate == null) {
    details.push({ field: 'expiryDate', message: 'expiryDate is required when creating a new batch' });
  }
  if (typeof input.quantity !== 'number' && typeof input.quantity !== 'string') {
    details.push({ field: 'quantity', message: 'Quantity is required' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);

  const quantity = validateQuantity(input.quantity);

  // Scope must cover the target organization.
  const scopeSets = await getScopeSets(userId);
  const willAllow = scopeSets.orgIds.includes(organizationId) ||
    (await getBranch(branchId))?.organization_id === organizationId && scopeSets.branchIds.includes(branchId) ||
    (await getWarehouse(warehouseId))?.branch_id === branchId && scopeSets.warehouseIds.includes(warehouseId);
  if (!willAllow) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  const [product, branch, warehouse, storageLocation, unit] = await Promise.all([
    getProduct(productId), getBranch(branchId), getWarehouse(warehouseId), getStorageLocation(storageLocationId), getUnit(unitId),
  ]);

  if (!product) throw new AppError('Product does not exist', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  if (product.organization_id !== organizationId) throw new ValidationError('Validation failed', [{ field: 'productId', message: 'Product belongs to a different organization' }]);
  if (product.status !== 'active') throw new AppError('Inactive products cannot be used for new inventory operations', { statusCode: 409, code: 'PRODUCT_INACTIVE' });

  if (!branch) throw new AppError('Branch does not exist', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  if (branch.organization_id !== organizationId) throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Branch belongs to a different organization' }]);
  if (branch.status !== 'active') throw new AppError('Inactive branches cannot receive opening balance', { statusCode: 409, code: 'BRANCH_INACTIVE' });

  if (!warehouse) throw new AppError('Warehouse does not exist', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });
  if (warehouse.branch_id !== branchId) throw new ValidationError('Validation failed', [{ field: 'warehouseId', message: 'Warehouse belongs to a different branch' }]);
  if (warehouse.status !== 'active') throw new AppError('Inactive warehouses cannot receive opening balance', { statusCode: 409, code: 'WAREHOUSE_INACTIVE' });

  if (!storageLocation) throw new AppError('Storage location does not exist', { statusCode: 404, code: 'STORAGE_LOCATION_NOT_FOUND' });
  if (storageLocation.warehouse_id !== warehouseId) throw new ValidationError('Validation failed', [{ field: 'storageLocationId', message: 'Storage location belongs to a different warehouse' }]);
  if (storageLocation.status !== 'active') throw new AppError('Inactive storage locations cannot receive opening balance', { statusCode: 409, code: 'STORAGE_LOCATION_INACTIVE' });

  if (!unit) throw new AppError('Unit does not exist', { statusCode: 404, code: 'UNIT_NOT_FOUND' });
  if (unit.organization_id !== organizationId) throw new ValidationError('Validation failed', [{ field: 'unitId', message: 'Unit belongs to a different organization' }]);
  if (unit.status !== 'active') throw new AppError('Inactive units cannot be used for opening balance', { statusCode: 409, code: 'UNIT_INACTIVE' });

  // Resolve/verify batch (batch may already exist from a previous operation).
  let batch;
  if (input.batchId != null) {
    batch = await getBatch(Number(input.batchId));
    if (!batch) throw new AppError('Batch does not exist', { statusCode: 404, code: 'BATCH_NOT_FOUND' });
    if (batch.product_id !== productId) throw new ValidationError('Validation failed', [{ field: 'batchId', message: 'Batch belongs to a different product' }]);
    if (batch.organization_id !== organizationId) throw new ValidationError('Validation failed', [{ field: 'batchId', message: 'Batch belongs to a different organization' }]);
    if (batch.status !== 'active') throw new AppError('Inactive batch can not be used for a new opening balance', { statusCode: 409, code: 'BATCH_INACTIVE' });
  } else {
    batch = await inventoryRepository.findBatch({ organizationId, productId, batchNumber: input.batchNumber.trim() });
    if (batch && batch.status !== 'active') throw new AppError('Batch is inactive', { statusCode: 409, code: 'BATCH_INACTIVE' });
    if (batch && input.expiryDate) {
      const mismatch = new Date(batch.expiry_date).getTime() !== new Date(input.expiryDate).getTime();
      if (mismatch) throw new ValidationError('Validation failed', [{ field: 'expiryDate', message: 'Existing batch already has a different expiry date' }]);
    }
  }

  if (input.expiryDate != null) validateExpiry(input.expiryDate);
  if (new Date(batch?.expiry_date ?? input.expiryDate).getTime() < Date.now()) {
    // Expired stock may still be tracked for traceability but is never 'available'
    // unless an authorized expiry workflow later releases/disposes it.
  }

  const expired = new Date(batch?.expiry_date ?? input.expiryDate).getTime() < Date.now();

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let effectiveBatch = batch;
    if (!effectiveBatch) {
      const [result] = await connection.query(
        'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date) VALUES (?, ?, ?, ?)',
        [organizationId, productId, input.batchNumber.trim(), input.expiryDate],
      );
      effectiveBatch = { id: result.insertId, organization_id: organizationId, product_id: productId, batch_number: input.batchNumber.trim(), expiry_date: input.expiryDate, status: 'active' };
    }

    const targetStatus = expired ? 'expired' : 'available';

    const existing = await connection.query(
      `SELECT id FROM inventory
       WHERE organization_id = ? AND branch_id = ? AND warehouse_id = ? AND storage_location_id = ?
         AND product_id = ? AND batch_id = ? AND unit_id = ? AND status = ? LIMIT 1`,
      [organizationId, branchId, warehouseId, storageLocationId, productId, effectiveBatch.id, unitId, targetStatus],
    );
    let inventoryId;
    if (existing[0].length > 0) {
      inventoryId = existing[0][0].id;
      await connection.query('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [quantity, inventoryId]);
    } else {
      const [res] = await connection.query(
        `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [organizationId, branchId, warehouseId, storageLocationId, productId, effectiveBatch.id, unitId, targetStatus, quantity],
      );
      inventoryId = res.insertId;
    }

    const [movementResult] = await connection.query(
      `INSERT INTO stock_movements (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'opening_balance', ?, ?, ?, ?, ?)`,
      [organizationId, branchId, warehouseId, storageLocationId, productId, effectiveBatch.id, unitId, quantity, input.referenceType || null, input.referenceId || null, input.reason || null, userId],
    );

    await connection.commit();
    return {
      inventoryId,
      batchId: effectiveBatch.id,
      movementId: movementResult.insertId,
      status: targetStatus,
      quantity,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Internal decrement helper (used by tests and future inventory operations).
 * Atomically validates against negative stock within the same DB transaction
 * that records the compensating movement.
 */
async function decreaseAvailableStock({ inventoryId, userId, quantity, movement_type = 'other', reason, referenceType, referenceId }) {
  const qty = validateQuantity(quantity);
  const row = await inventoryRepository.findInventoryById(inventoryId);
  if (!row) throw new AppError('Inventory record not found', { statusCode: 404, code: 'INVENTORY_NOT_FOUND' });
  if (row.status !== 'available') {
    throw new AppError('Only available stock can be used for consumption', { statusCode: 409, code: 'STOCK_NOT_AVAILABLE' });
  }
  if (new Date(row.expiry_date).getTime() < Date.now()) {
    throw new AppError('Expired stock cannot be consumed', { statusCode: 409, code: 'EXPIRED_STOCK' });
  }
  const scopeSets = await getScopeSets(userId);
  if (!allowed(scopeSets, row)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the row for update so concurrent decrementers serialize.
    const [lockedRows] = await connection.query('SELECT quantity FROM inventory WHERE id = ? FOR UPDATE', [inventoryId]);
    if (lockedRows.length === 0) throw new AppError('Inventory record not found', { statusCode: 404, code: 'INVENTORY_NOT_FOUND' });
    const current = Number(lockedRows[0].quantity);
    if (current < qty) {
      throw new AppError('Insufficient available stock', { statusCode: 409, code: 'INSUFFICIENT_STOCK' });
    }

    await connection.query('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [qty, inventoryId]);
    await connection.query(
      `INSERT INTO stock_movements (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.organization_id, row.branch_id, row.warehouse_id, row.storage_location_id, row.product_id, row.batch_id, row.unit_id, movement_type, -qty, referenceType || null, referenceId || null, reason || null, userId],
    );

    await connection.commit();
    return { inventoryId, remaining: current - qty };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// -- Authorization scope helpers over inventory rows ---------------------------

async function getInventoryForUser(id, userId) {
  const row = await inventoryRepository.findInventoryById(id);
  if (!row) throw new AppError('Inventory record not found', { statusCode: 404, code: 'INVENTORY_NOT_FOUND' });
  await requireScopeOnRow(userId, row);
  return row;
}

async function getBatchForUser(id, userId) {
  const batch = await inventoryRepository.findBatchById(id);
  if (!batch) throw new AppError('Batch not found', { statusCode: 404, code: 'BATCH_NOT_FOUND' });
  const scopeSets = await getScopeSets(userId);
  if (!scopeSets.orgIds.includes(Number(batch.organization_id))) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }
  const quantity = await inventoryRepository.getBatchQuantity(id);
  return { ...batch, quantity };
}

async function getStockMovementForUser(id, userId) {
  const movement = await inventoryRepository.findStockMovementById(id);
  if (!movement) throw new AppError('Stock movement not found', { statusCode: 404, code: 'STOCK_MOVEMENT_NOT_FOUND' });
  await requireScopeOnRow(userId, movement);
  return movement;
}

async function listInventoryForUser(userId, filters) {
  const scopeSets = await getScopeSets(userId);
  return inventoryRepository.listInventory({
    ...filters,
    accessibleOrgIds: scopeSets.orgIds,
    accessibleBranchIds: scopeSets.branchIds,
    accessibleWarehouseIds: scopeSets.warehouseIds,
  });
}

async function listBatchesForUser(userId, filters) {
  const scopeSets = await getScopeSets(userId);
  return inventoryRepository.listBatches({ ...filters, accessibleOrgIds: scopeSets.orgIds });
}

async function listMovementsForUser(userId, filters) {
  const scopeSets = await getScopeSets(userId);
  return inventoryRepository.listStockMovements({
    ...filters,
    accessibleOrgIds: scopeSets.orgIds,
    accessibleBranchIds: scopeSets.branchIds,
    accessibleWarehouseIds: scopeSets.warehouseIds,
  });
}

export default {
  listInventoryForUser,
  getInventoryForUser,
  createOpeningBalance,
  getBatchForUser,
  listBatchesForUser,
  getStockMovementForUser,
  listStockMovementsForUser: listMovementsForUser,
  decreaseAvailableStock,
};
