import { getPool } from '../database/pool.js';

async function findByUserId(userId) {
  const [rows] = await getPool().query(
    `SELECT id, user_id, scope_type, organization_id, branch_id, warehouse_id, created_at
     FROM user_scopes WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  return rows;
}

async function replaceForUser(userId, scopes) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM user_scopes WHERE user_id = ?', [userId]);
    for (const scope of scopes) {
      await connection.query(
        'INSERT INTO user_scopes (user_id, scope_type, organization_id, branch_id, warehouse_id) VALUES (?, ?, ?, ?, ?)',
        [
          userId,
          scope.scopeType,
          scope.scopeType === 'organization' ? scope.organizationId : null,
          scope.scopeType === 'branch' ? scope.branchId : null,
          scope.scopeType === 'warehouse' ? scope.warehouseId : null,
        ],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return findByUserId(userId);
}

export default { findByUserId, replaceForUser };
