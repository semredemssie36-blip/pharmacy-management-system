import { getPool } from '../database/pool.js';

const FIELDS = 'id, organization_id, name, code, status, created_at, updated_at';

async function findAll(filters = {}) {
  const where = [];
  const params = [];
  if (filters.organizationId) {
    where.push('organization_id = ?');
    params.push(filters.organizationId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM branches ${whereSql} ORDER BY id`, params);
  return rows;
}

async function findById(id) {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM branches WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByCode(organizationId, code) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM branches WHERE organization_id = ? AND code = ? LIMIT 1`,
    [organizationId, code],
  );
  return rows[0] || null;
}

async function create({ organizationId, name, code, status = 'active' }) {
  const [result] = await getPool().query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, ?)',
    [organizationId, name, code, status],
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
  await getPool().query(`UPDATE branches SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export default { findAll, findById, findByCode, create, update };
