import { getPool } from '../database/pool.js';

/**
 * User persistence. Queries are parameterized. Password hashes must
 * never leave this layer except for verification inside the service.
 */
async function findByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, status, created_at, updated_at FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

async function createUser({ name, email, passwordHash, status = 'active' }) {
  const pool = getPool();
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, status],
  );
  return findById(result.insertId);
}

export default { findByEmail, findById, createUser };
