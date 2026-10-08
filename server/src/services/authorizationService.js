import { getPool } from '../database/pool.js';
import userScopeRepository from '../repositories/userScopeRepository.js';
import AppError from '../errors/AppError.js';

/** Effective permission codes for a user (all active-role permissions). */
async function getUserPermissions(userId) {
  const [rows] = await getPool().query(
    `SELECT DISTINCT p.code
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     JOIN roles r ON r.id = ur.role_id AND r.status = 'active'
     WHERE ur.user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.code);
}

async function getUserRoles(userId) {
  const [rows] = await getPool().query(
    `SELECT r.id, r.name, r.code, r.status
     FROM roles r JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ? ORDER BY r.id`,
    [userId],
  );
  return rows;
}

async function setUserRoles(userId, roleIds) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    for (const roleId of roleIds) {
      await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return getUserRoles(userId);
}

/**
 * Scope resolution rules (documented in README):
 * - organization scope (org O) grants O and all its branches/warehouses/locations
 * - branch scope (branch B) grants B and its warehouses/locations
 * - warehouse scope (warehouse W) grants W and its locations
 * A branch scope does NOT grant access to the whole organization.
 */
async function getUserScope(userId) {
  const rows = await userScopeRepository.findByUserId(userId);
  return {
    organizationIds: new Set(rows.filter((r) => r.scope_type === 'organization').map((r) => r.organization_id)),
    branchIds: new Set(rows.filter((r) => r.scope_type === 'branch').map((r) => r.branch_id)),
    warehouseIds: new Set(rows.filter((r) => r.scope_type === 'warehouse').map((r) => r.warehouse_id)),
  };
}

function scopeDenied() {
  return new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
}

const canAccessOrganization = (scope, organizationId) => scope.organizationIds.has(organizationId);

const canAccessBranch = (scope, branch) =>
  scope.organizationIds.has(branch.organization_id) || scope.branchIds.has(branch.id);

const canAccessWarehouse = (scope, warehouse) =>
  scope.organizationIds.has(warehouse.organization_id) ||
  scope.branchIds.has(warehouse.branch_id) ||
  scope.warehouseIds.has(warehouse.id);

const canAccessStorageLocation = (scope, location) =>
  scope.organizationIds.has(location.organization_id) ||
  scope.branchIds.has(location.branch_id) ||
  scope.warehouseIds.has(location.warehouse_id);

async function assertOrganizationAccess(userId, organizationId) {
  if (!canAccessOrganization(await getUserScope(userId), organizationId)) throw scopeDenied();
}

async function assertBranchAccess(userId, branch) {
  if (!canAccessBranch(await getUserScope(userId), branch)) throw scopeDenied();
}

async function assertWarehouseAccess(userId, warehouse) {
  if (!canAccessWarehouse(await getUserScope(userId), warehouse)) throw scopeDenied();
}

async function assertStorageLocationAccess(userId, location) {
  if (!canAccessStorageLocation(await getUserScope(userId), location)) throw scopeDenied();
}

/** Filter a list of rows (each must expose lineage fields) by the user's scope. */
function filterByScope(scope, rows, predicate) {
  return rows.filter((row) => predicate(scope, row));
}

export default {
  getUserPermissions,
  getUserRoles,
  setUserRoles,
  getUserScope,
  assertOrganizationAccess,
  assertBranchAccess,
  assertWarehouseAccess,
  assertStorageLocationAccess,
  filterByScope,
  canAccessOrganization,
  canAccessBranch,
  canAccessWarehouse,
  canAccessStorageLocation,
};
