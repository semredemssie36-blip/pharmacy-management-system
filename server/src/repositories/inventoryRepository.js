import { getPool } from '../database/pool.js';

const INVENTORY_FIELDS = `
  i.id, i.organization_id, i.branch_id, i.warehouse_id, i.storage_location_id,
  i.product_id, i.batch_id, i.unit_id, i.status, i.quantity, i.created_at, i.updated_at`;

async function listInventory({ organizationId, branchId, warehouseId, storageLocationId, productId, batchId, status, search, page = 1, limit = 20, sort = 'created_at', accessibleOrgIds, accessibleBranchIds, accessibleWarehouseIds }) {
  const where = [];
  const params = [];

  // Scope visibility: a row is visible if the user has an org scope on its
  // organization OR a branch scope on its branch OR a warehouse scope on its
  // warehouse. (Branch scope implies that branch; warehouse scope only that
  // warehouse; org scope implies the whole org.)
  if (accessibleOrgIds.length === 0 && accessibleBranchIds.length === 0 && accessibleWarehouseIds.length === 0) {
    return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
  }
  const scopeOr = [];
  if (accessibleOrgIds.length > 0) { scopeOr.push(`i.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`); params.push(...accessibleOrgIds); }
  if (accessibleBranchIds.length > 0) { scopeOr.push(`i.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`); params.push(...accessibleBranchIds); }
  if (accessibleWarehouseIds.length > 0) { scopeOr.push(`i.warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')})`); params.push(...accessibleWarehouseIds); }
  where.push(`(${scopeOr.join(' OR ')})`);

  if (organizationId) { where.push('i.organization_id = ?'); params.push(Number(organizationId)); }
  if (branchId) { where.push('i.branch_id = ?'); params.push(Number(branchId)); }
  if (warehouseId) { where.push('i.warehouse_id = ?'); params.push(Number(warehouseId)); }
  if (storageLocationId) { where.push('i.storage_location_id = ?'); params.push(Number(storageLocationId)); }
  if (productId) { where.push('i.product_id = ?'); params.push(Number(productId)); }
  if (batchId) { where.push('i.batch_id = ?'); params.push(Number(batchId)); }
  if (status) { where.push('i.status = ?'); params.push(status); }
  if (search) {
    where.push('(p.name LIKE ? OR p.code LIKE ? OR b.batch_number LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortMap = { created_at: 'i.created_at', quantity: 'i.quantity', name: 'p.name' };
  const orderColumn = sortMap[sort] || 'i.created_at';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN batches b ON b.id = i.batch_id ${whereSql}`,
    params,
  );
  const [items] = await getPool().query(
    `SELECT i.id, i.organization_id, i.branch_id, i.warehouse_id, i.storage_location_id,
            i.product_id, i.batch_id, i.unit_id, i.status, i.quantity, i.created_at, i.updated_at,
            p.name AS product_name, p.code AS product_code, b.batch_number, b.expiry_date,
            br.name AS branch_name, w.name AS warehouse_name, sl.name AS storage_location_name,
            u.name AS unit_name
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN batches b ON b.id = i.batch_id
     JOIN branches br ON br.id = i.branch_id
     JOIN warehouses w ON w.id = i.warehouse_id
     JOIN storage_locations sl ON sl.id = i.storage_location_id
     JOIN units u ON u.id = i.unit_id
     ${whereSql}
     ORDER BY ${orderColumn} LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );
  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findInventoryById(id) {
  const [rows] = await getPool().query(
    `SELECT ${INVENTORY_FIELDS}, p.name AS product_name, b.batch_number, b.expiry_date,
            br.name AS branch_name, w.name AS warehouse_name, sl.name AS storage_location_name,
            u.name AS unit_name
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN batches b ON b.id = i.batch_id
     JOIN branches br ON br.id = i.branch_id
     JOIN warehouses w ON w.id = i.warehouse_id
     JOIN storage_locations sl ON sl.id = i.storage_location_id
     JOIN units u ON u.id = i.unit_id
     WHERE i.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findInventoryRow({ organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, status }) {
  const [rows] = await getPool().query(
    `SELECT ${INVENTORY_FIELDS} FROM inventory i
     WHERE i.organization_id = ? AND i.branch_id = ? AND i.warehouse_id = ? AND i.storage_location_id = ?
       AND i.product_id = ? AND i.batch_id = ? AND i.unit_id = ? AND i.status = ? LIMIT 1`,
    [organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, status],
  );
  return rows[0] || null;
}

async function upsertInventoryRow({ organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, status, quantity }) {
  const existing = await findInventoryRow({ organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, status });
  if (existing) {
    await getPool().query('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [quantity, existing.id]);
    return findInventoryById(existing.id);
  }
  const [result] = await getPool().query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, status, quantity],
  );
  return findInventoryById(result.insertId);
}

/** Atomic quantity update safe under concurrency: conditional on sufficient available qty. */
async function conditionalDecrease(inventoryId, delta) {
  const [result] = await getPool().query(
    'UPDATE inventory SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
    [delta, inventoryId, delta],
  );
  return result.affectedRows;
}

// -- Batches ------------------------------------------------------------------

const BATCH_FIELDS = 'b.id, b.organization_id, b.product_id, b.batch_number, b.expiry_date, b.status, b.created_at, b.updated_at';

async function listBatches({ organizationId, productId, status, search, page = 1, limit = 20, accessibleOrgIds }) {
  const where = [];
  const params = [];
  if (!accessibleOrgIds || accessibleOrgIds.length === 0) return { items: [], total: 0, page: 1, limit: Number(limit) || 20 };
  where.push(`b.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
  params.push(...accessibleOrgIds);
  if (organizationId) { where.push('b.organization_id = ?'); params.push(Number(organizationId)); }
  if (productId) { where.push('b.product_id = ?'); params.push(Number(productId)); }
  if (status) { where.push('b.status = ?'); params.push(status); }
  if (search) {
    where.push('(b.batch_number LIKE ? OR p.name LIKE ? OR p.code LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM batches b JOIN products p ON p.id = b.product_id ${whereSql}`,
    params,
  );
  const [items] = await getPool().query(
    `SELECT ${BATCH_FIELDS}, p.name AS product_name, p.code AS product_code
     FROM batches b JOIN products p ON p.id = b.product_id ${whereSql}
     ORDER BY b.expiry_date LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );
  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findBatchById(id) {
  const [rows] = await getPool().query(
    `SELECT ${BATCH_FIELDS}, p.name AS product_name FROM batches b JOIN products p ON p.id = b.product_id WHERE b.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findBatch({ organizationId, productId, batchNumber }) {
  const [rows] = await getPool().query(
    'SELECT id, organization_id, product_id, batch_number, expiry_date, status FROM batches WHERE organization_id = ? AND product_id = ? AND batch_number = ? LIMIT 1',
    [organizationId, productId, batchNumber],
  );
  return rows[0] || null;
}

async function createBatch({ organizationId, productId, batchNumber, expiryDate }) {
  const [result] = await getPool().query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date) VALUES (?, ?, ?, ?)',
    [organizationId, productId, batchNumber, expiryDate],
  );
  return findBatchById(result.insertId);
}

async function getBatchQuantity(batchId) {
  const [rows] = await getPool().query(
    `SELECT COALESCE(SUM(quantity), 0) AS total_quantity,
            COALESCE(SUM(CASE WHEN status = 'available' THEN quantity ELSE 0 END), 0) AS available_quantity
     FROM inventory WHERE batch_id = ?`,
    [batchId],
  );
  return rows[0] || { total_quantity: 0, available_quantity: 0 };
}

// -- Stock movements ------------------------------------------------------------

async function recordStockMovement({ organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, movementType, quantityDelta, referenceType, referenceId, reason, createdBy }) {
  const [result] = await getPool().query(
    `INSERT INTO stock_movements (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, movement_type, quantity_delta, reference_type, reference_id, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [organizationId, branchId, warehouseId, storageLocationId, productId, batchId, unitId, movementType, quantityDelta, referenceType || null, referenceId || null, reason || null, createdBy],
  );
  return result.insertId;
}

async function listStockMovements({ organizationId, branchId, warehouseId, productId, batchId, movementType, page = 1, limit = 20, sort = 'created_at', accessibleOrgIds, accessibleBranchIds, accessibleWarehouseIds }) {
  const where = [];
  const params = [];
  if (accessibleOrgIds.length === 0 && accessibleBranchIds.length === 0 && accessibleWarehouseIds.length === 0) {
    return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
  }
  const scopeOr = [];
  if (accessibleOrgIds.length > 0) { scopeOr.push(`sm.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`); params.push(...accessibleOrgIds); }
  if (accessibleBranchIds.length > 0) { scopeOr.push(`sm.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`); params.push(...accessibleBranchIds); }
  if (accessibleWarehouseIds.length > 0) { scopeOr.push(`sm.warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')})`); params.push(...accessibleWarehouseIds); }
  where.push(`(${scopeOr.join(' OR ')})`);

  if (organizationId) { where.push('sm.organization_id = ?'); params.push(Number(organizationId)); }
  if (branchId) { where.push('sm.branch_id = ?'); params.push(Number(branchId)); }
  if (warehouseId) { where.push('sm.warehouse_id = ?'); params.push(Number(warehouseId)); }
  if (productId) { where.push('sm.product_id = ?'); params.push(Number(productId)); }
  if (batchId) { where.push('sm.batch_id = ?'); params.push(Number(batchId)); }
  if (movementType) { where.push('sm.movement_type = ?'); params.push(movementType); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM stock_movements sm ${whereSql}`, params);
  const [items] = await getPool().query(
    `SELECT sm.id, sm.organization_id, sm.branch_id, sm.warehouse_id, sm.storage_location_id,
            sm.product_id, sm.batch_id, sm.unit_id, sm.movement_type, sm.quantity_delta,
            sm.reference_type, sm.reference_id, sm.reason, sm.created_by, sm.created_at,
            p.name AS product_name, p.code AS product_code, b.batch_number, b.expiry_date,
            br.name AS branch_name, w.name AS warehouse_name, sl.name AS storage_location_name,
            u.name AS unit_name, usr.name AS created_by_name
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     JOIN batches b ON b.id = sm.batch_id
     JOIN branches br ON br.id = sm.branch_id
     JOIN warehouses w ON w.id = sm.warehouse_id
     JOIN storage_locations sl ON sl.id = sm.storage_location_id
     JOIN units u ON u.id = sm.unit_id
     JOIN users usr ON usr.id = sm.created_by
     ${whereSql}
     ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );
  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findStockMovementById(id) {
  const [rows] = await getPool().query(
    `SELECT sm.id, sm.organization_id, sm.branch_id, sm.warehouse_id, sm.storage_location_id,
            sm.product_id, sm.batch_id, sm.unit_id, sm.movement_type, sm.quantity_delta,
            sm.reference_type, sm.reference_id, sm.reason, sm.created_by, sm.created_at,
            p.name AS product_name, b.batch_number, b.expiry_date, br.name AS branch_name,
            w.name AS warehouse_name, sl.name AS storage_location_name, u.name AS unit_name
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     JOIN batches b ON b.id = sm.batch_id
     JOIN branches br ON br.id = sm.branch_id
     JOIN warehouses w ON w.id = sm.warehouse_id
     JOIN storage_locations sl ON sl.id = sm.storage_location_id
     JOIN units u ON u.id = sm.unit_id
     WHERE sm.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export default {
  listInventory, findInventoryById, findInventoryRow, upsertInventoryRow, conditionalDecrease,
  listBatches, findBatchById, findBatch, createBatch, getBatchQuantity,
  recordStockMovement, listStockMovements, findStockMovementById,
};
