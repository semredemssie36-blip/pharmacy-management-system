import { getPool } from '../database/pool.js';

const FIELDS =
  'id, name, code, status, created_at, updated_at';

async function findAll() {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM organizations ORDER BY id`);
  return rows;
}

async function findById(id) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM organizations WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await getPool().query(
    `SELECT ${FIELDS} FROM organizations WHERE code = ? LIMIT 1`,
    [code],
  );
  return rows[0] || null;
}

async function create({ name, code, status = 'active' }) {
  const [result] = await getPool().query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, ?)',
    [name, code, status],
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
  await getPool().query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export default { findAll, findById, findByCode, create, update };
