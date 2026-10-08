import { getPool } from '../database/pool.js';

const FIELDS = 'id, name, email, password_hash, status, created_at, updated_at';

async function findAll() {
  const [rows] = await getPool().query(
    'SELECT id, name, email, status, created_at, updated_at FROM users ORDER BY id',
  );
  return rows;
}

async function findById(id) {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM users WHERE email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

async function create({ name, email, passwordHash, status = 'active' }) {
  const [result] = await getPool().query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, status],
  );
  return findById(result.insertId);
}

async function update(id, { name, email, status }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (email !== undefined) { sets.push('email = ?'); params.push(email); }
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (sets.length === 0) return findById(id);
  params.push(id);
  await getPool().query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

export default { findAll, findById, findByEmail, create, update };
