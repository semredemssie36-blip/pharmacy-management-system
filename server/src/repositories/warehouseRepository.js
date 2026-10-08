import { getPool } from '../database/pool.js';

const FIELDS =
  'w.id, w.branch_id, w.name, w.code, w.status, w.created_at, w.updated_at, b.organization_id';

async function findAll(filters = {}) {
  const where = [];
  const params = [];
  if (filters.branchId) {
    where.push('w.branch_id = ?');
    params.push(filters.branchId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM warehouses w JOIN branches b ON b.id = w.branch_id ${whereSql} ORDER BY w.id`,
    params,
  );
  return rows;
}

async function findById(id) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByCode(branchId, code) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.branch_id = ? AND w.code = ? LIMIT 1`,
    [branchId, code],
  );
  return rows[0] || null;
}

async function create({ branchId, name, code, status = 'active' }) {
  const [result] = await getPool().query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, ?)',
    [branchId, name, code, status],
  );
  return findById(result.insertId);
}

async function update(id, { name, code, status }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (code !== undefined) { sets.push('code = ?'); params.push(code); }
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (sets.length === 0) return findById(id);
  params.push(id);
  await getPool().query(`UPDATE warehouses SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export default { findAll, findById, findByCode, create, update };
