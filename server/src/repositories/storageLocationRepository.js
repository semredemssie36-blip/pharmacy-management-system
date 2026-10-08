import { getPool } from '../database/pool.js';

const FIELDS =
  'sl.id, sl.warehouse_id, sl.name, sl.code, sl.storage_condition, sl.status, sl.created_at, sl.updated_at, w.branch_id, b.organization_id';

async function findAll(filters = {}) {
  const where = [];
  const params = [];
  if (filters.warehouseId) {
    where.push('sl.warehouse_id = ?');
    params.push(filters.warehouseId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM storage_locations sl
     JOIN warehouses w ON w.id = sl.warehouse_id
     JOIN branches b ON b.id = w.branch_id ${whereSql} ORDER BY sl.id`,
    params,
  );
  return rows;
}

async function findById(id) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM storage_locations sl
     JOIN warehouses w ON w.id = sl.warehouse_id
     JOIN branches b ON b.id = w.branch_id WHERE sl.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByCode(warehouseId, code) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM storage_locations sl
     JOIN warehouses w ON w.id = sl.warehouse_id
     JOIN branches b ON b.id = w.branch_id WHERE sl.warehouse_id = ? AND sl.code = ? LIMIT 1`,
    [warehouseId, code],
  );
  return rows[0] || null;
}

async function create({ warehouseId, name, code, storageCondition = 'normal', status = 'active' }) {
  const [result] = await getPool().query(
    'INSERT INTO storage_locations (warehouse_id, name, code, storage_condition, status) VALUES (?, ?, ?, ?, ?)',
    [warehouseId, name, code, storageCondition, status],
  );
  return findById(result.insertId);
}

async function update(id, { name, code, storageCondition, status }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (code !== undefined) { sets.push('code = ?'); params.push(code); }
  if (storageCondition !== undefined) { sets.push('storage_condition = ?'); params.push(storageCondition); }
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (sets.length === 0) return findById(id);
  params.push(id);
  await getPool().query(`UPDATE storage_locations SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export default { findAll, findById, findByCode, create, update };
