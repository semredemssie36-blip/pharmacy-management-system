import mysql from 'mysql2/promise';
import databaseConfig from '../config/database.js';

/**
 * Reusable MySQL connection pool.
 *
 * Created once and shared across repositories. Individual business
 * repositories (added in later tasks) will import and use this pool —
 * they must NOT create their own ad-hoc connections.
 *
 * The pool is created lazily on first access so the server can start
 * and serve /api/health even when no database is reachable yet.
 */
let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(databaseConfig);
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
