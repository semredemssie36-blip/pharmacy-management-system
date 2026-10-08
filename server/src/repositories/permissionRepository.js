import { getPool } from '../database/pool.js';

async function findAll(filters = {}) {
  const where = [];
  const params = [];
  if (filters.module) { where.push('module = ?'); params.push(filters.module); }
  if (filters.resource) { where.push('resource = ?'); params.push(filters.resource); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await getPool().query(
    `SELECT id, code, module, resource, action, description, created_at FROM permissions ${whereSql} ORDER BY code`,
    params,
  );
  return rows;
}

async function findByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await getPool().query(
    `SELECT id, code, module, resource, action, description FROM permissions WHERE id IN (${placeholders})`,
    ids,
  );
  return rows;
}

export default { findAll, findByIds };
