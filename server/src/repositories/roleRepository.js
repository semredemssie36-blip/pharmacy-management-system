import { getPool } from '../database/pool.js';

const FIELDS = 'id, name, code, description, status, created_at, updated_at';

async function findAll() {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM roles ORDER BY id`);
  return rows;
}

async function findById(id) {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM roles WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await getPool().query(`SELECT ${FIELDS} FROM roles WHERE code = ? LIMIT 1`, [code]);
  return rows[0] || null;
}

async function create({ name, code, description = null, status = 'active' }) {
  const [result] = await getPool().query(
    'INSERT INTO roles (name, code, description, status) VALUES (?, ?, ?, ?)',
    [name, code, description, status],
  );
  return findById(result.insertId);
}

async function update(id, { name, code, description, status }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (code !== undefined) { sets.push('code = ?'); params.push(code); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description); }
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (sets.length === 0) return findById(id);
  params.push(id);
  await getPool().query(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function getRolePermissions(roleId) {
  const [rows] = await getPool().query(
    `SELECT p.id, p.code, p.module, p.resource, p.action, p.description
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?
     ORDER BY p.code`,
    [roleId],
  );
  return rows;
}

async function setRolePermissions(roleId, permissionIds) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    for (const permissionId of permissionIds) {
      await connection.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleId, permissionId],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return getRolePermissions(roleId);
}

export default { findAll, findById, findByCode, create, update, getRolePermissions, setRolePermissions };
