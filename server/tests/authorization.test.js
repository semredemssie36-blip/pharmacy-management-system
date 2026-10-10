/**
 * Task 04 — Users, Roles, Permissions, and Data Scope authorization tests.
 * Runs against the isolated pharmacy_erp_test database.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_HOST = '127.0.0.1';
process.env.DATABASE_PORT = '3306';
process.env.DATABASE_NAME = 'pharmacy_erp_test';
process.env.DATABASE_USER = 'root';
process.env.DATABASE_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.AUTH_COOKIE_SECURE = 'false';

let app;
let pool;
let closePool;

// Entities shared across tests
let orgPiassaId; // "Piassa Org"
let orgMegenagnaId; // "Megenagna Org"
let branchPiassaId; // branch under Piassa Org
let branchMegenagnaId; // branch under Megenagna Org
let warehousePiassaId;
let locationPiassaId;

const PASSWORD = 'Passw0rd!x';

async function insertUser(name, email, status = 'active') {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), status],
  );
  return r.insertId;
}

async function insertRole(name, code) {
  const [r] = await pool.query(
    'INSERT INTO roles (name, code, description, status) VALUES (?, ?, ?, ?)',
    [name, code, 'test role', 'active'],
  );
  return r.insertId;
}

async function grantPermissions(roleId, codes) {
  for (const code of codes) {
    const [[p]] = await pool.query('SELECT id FROM permissions WHERE code = ?', [code]);
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, p.id]);
  }
}

async function assignRole(userId, roleId) {
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
}

async function assignScope(userId, scopeType, id) {
  const organizationId = scopeType === 'organization' ? id : null;
  const branchId = scopeType === 'branch' ? id : null;
  const warehouseId = scopeType === 'warehouse' ? id : null;
  await pool.query(
    'INSERT INTO user_scopes (user_id, scope_type, organization_id, branch_id, warehouse_id) VALUES (?, ?, ?, ?, ?)',
    [userId, scopeType, organizationId, branchId, warehouseId],
  );
}

async function agentFor(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return agent;
}

async function seedStructure() {
  const [o1] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Piassa Pharmacy (Test)', 'PIASSA_TEST')");
  const [o2] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Megenagna Pharmacy (Test)', 'MEGENAGNA_TEST')");
  orgPiassaId = o1.insertId;
  orgMegenagnaId = o2.insertId;

  const [b1] = await pool.query(
    'INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)',
    [orgPiassaId, 'Piassa Branch (Test)', 'PB'],
  );
  const [b2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)',
    [orgMegenagnaId, 'Megenagna Branch (Test)', 'MB'],
  );
  branchPiassaId = b1.insertId;
  branchMegenagnaId = b2.insertId;

  const [w1] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)',
    [branchPiassaId, 'Piassa Main Warehouse (Test)', 'PMW'],
  );
  warehousePiassaId = w1.insertId;

  const [s1] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, ?, ?, ?)',
    [warehousePiassaId, 'Shelf A (Test)', 'SA', 'normal'],
  );
  locationPiassaId = s1.insertId;
}

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM role_permissions');
  await pool.query('DELETE FROM roles');
  await pool.query("DELETE FROM users WHERE email LIKE '%@scope-test.local'");
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  await seedStructure();
});

after(async () => {
  try {
    if (pool) {
      await pool.query('SET FOREIGN_KEY_CHECKS = 0');
      await pool.query('DELETE FROM storage_locations');
      await pool.query('DELETE FROM warehouses');
      await pool.query('DELETE FROM branches');
      await pool.query('DELETE FROM organizations');
      await pool.query('DELETE FROM user_scopes');
      await pool.query('DELETE FROM user_roles');
      await pool.query('DELETE FROM role_permissions');
      await pool.query('DELETE FROM roles');
      await pool.query("DELETE FROM users WHERE email LIKE '%@scope-test.local'");
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  } finally {
    if (closePool) await closePool();
  }
});

// 1. Unauthenticated request returns 401
test('unauthenticated requests are rejected with 401', async () => {
  const res = await request(app).get('/api/v1/organizations');
  assert.equal(res.status, 401);
});

// 2. Authenticated user without permission returns 403
test('authenticated user without required permission gets 403', async () => {
  await insertUser('NoPerms', 'noperms@scope-test.local');
  const agent = await agentFor('noperms@scope-test.local');
  const res = await agent.get('/api/v1/organizations');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

// 3. Authenticated user with required permission succeeds
test('authenticated user with required permission succeeds', async () => {
  const userId = await insertUser('Viewer', 'viewer@scope-test.local');
  const roleId = await insertRole('Viewer', 'VIEWER');
  await grantPermissions(roleId, ['organization.view']);
  await assignRole(userId, roleId);
  await assignScope(userId, 'organization', orgPiassaId);

  const agent = await agentFor('viewer@scope-test.local');
  const res = await agent.get('/api/v1/organizations');
  assert.equal(res.status, 200);
});

// 4. Role-to-permission assignment works
test('role-to-permission assignment works through the API', async () => {
  const adminId = await insertUser('AdminR', 'adminr@scope-test.local');
  const adminRoleId = await insertRole('AdminR', 'ADMINR');
  await grantPermissions(adminRoleId, [
    'role.view', 'role.create', 'role.update', 'role.deactivate',
    'user.view', 'user.update', 'organization.view',
  ]);
  await assignRole(adminId, adminRoleId);
  await assignScope(adminId, 'organization', orgPiassaId);

  const agent = await agentFor('adminr@scope-test.local');

  const roleRes = await agent.post('/api/v1/roles').send({ name: 'Custom Role', code: 'CUSTOM' });
  assert.equal(roleRes.status, 201);
  const roleId = roleRes.body.data.role.id;

  const [permRow] = await pool.query("SELECT id FROM permissions WHERE code = 'organization.view'");
  const assignRes = await agent.put(`/api/v1/roles/${roleId}/permissions`).send({ permissionIds: [permRow[0].id] });
  assert.equal(assignRes.status, 200);
  assert.ok(assignRes.body.data.role.permissions.some((p) => p.code === 'organization.view'));
});

// 5. User-to-role assignment works
test('user-to-role assignment works through the API', async () => {
  const adminId = await insertUser('AdminU', 'adminu@scope-test.local');
  const adminRoleId = await insertRole('AdminU', 'ADMINU');
  await grantPermissions(adminRoleId, ['user.view', 'user.update']);
  await assignRole(adminId, adminRoleId);

  const targetId = await insertUser('Target', 'target@scope-test.local');
  const newRoleId = await insertRole('TargetRole', 'TARGET_ROLE');

  const agent = await agentFor('adminu@scope-test.local');
  const res = await agent.put(`/api/v1/users/${targetId}/roles`).send({ roleIds: [newRoleId] });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.user.roles.some((r) => r.code === 'TARGET_ROLE'));
});

// 6. Permission changes affect authorization
test('permission changes affect subsequent authorization checks', async () => {
  const userId = await insertUser('Changer', 'changer@scope-test.local');
  const roleId = await insertRole('ChangerRole', 'CHANGER_ROLE');
  await assignRole(userId, roleId);

  const agent = await agentFor('changer@scope-test.local');
  let res = await agent.get('/api/v1/organizations');
  assert.equal(res.status, 403);

  // Admin grants organization.view to the role
  await pool.query(
    "INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = 'organization.view'",
    [roleId],
  );
  // org-scope needed as well
  await assignScope(userId, 'organization', orgPiassaId);

  res = await agent.get('/api/v1/organizations');
  assert.equal(res.status, 200);
});

// 7. Deactivated user cannot perform protected operations
test('deactivated user can no longer access protected endpoints', async () => {
  const userId = await insertUser('Deactivated', 'deactivated@scope-test.local');
  const roleId = await insertRole('DeactivatedRole', 'DEACTIVATED_ROLE');
  await grantPermissions(roleId, ['organization.view']);
  await assignRole(userId, roleId);
  await assignScope(userId, 'organization', orgPiassaId);

  const agent = await agentFor('deactivated@scope-test.local');
  const okRes = await agent.get('/api/v1/organizations');
  assert.equal(okRes.status, 200);

  await pool.query("UPDATE users SET status = 'inactive' WHERE id = ?", [userId]);
  const deniedRes = await agent.get('/api/v1/organizations');
  assert.equal(deniedRes.status, 403);
  assert.equal(deniedRes.body.error.code, 'ACCOUNT_INACTIVE');
});

// 8 & 9. Branch-scoped user access
test('branch-scoped user can access allowed branch but not another branch', async () => {
  const userId = await insertUser('BranchScope', 'branchscope@scope-test.local');
  const roleId = await insertRole('BranchScopeRole', 'BRANCH_SCOPE_ROLE');
  await grantPermissions(roleId, ['branch.view']);
  await assignRole(userId, roleId);
  await assignScope(userId, 'branch', branchPiassaId);

  const agent = await agentFor('branchscope@scope-test.local');

  const allowed = await agent.get(`/api/v1/branches/${branchPiassaId}`);
  assert.equal(allowed.status, 200);

  const denied = await agent.get(`/api/v1/branches/${branchMegenagnaId}`);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'FORBIDDEN');
});

// 10. Organization-scoped user can access permitted organization data
test('organization-scoped user can access its organization data', async () => {
  const userId = await insertUser('OrgScope', 'orgscope@scope-test.local');
  const roleId = await insertRole('OrgScopeRole', 'ORG_SCOPE_ROLE');
  await grantPermissions(roleId, ['organization.view', 'branch.view']);
  await assignRole(userId, roleId);
  await assignScope(userId, 'organization', orgPiassaId);

  const agent = await agentFor('orgscope@scope-test.local');

  const orgRes = await agent.get(`/api/v1/organizations/${orgPiassaId}`);
  assert.equal(orgRes.status, 200);

  const branchListRes = await agent.get(`/api/v1/branches?organizationId=${orgPiassaId}`);
  assert.equal(branchListRes.status, 200);
  assert.ok(branchListRes.body.data.branches.every((b) => b.organization_id === orgPiassaId));

  const otherOrgRes = await agent.get(`/api/v1/organizations/${orgMegenagnaId}`);
  assert.equal(otherOrgRes.status, 403);
});

// 11. Warehouse-scoped user cannot access an unauthorized warehouse
test('warehouse-scoped user cannot access an unauthorized warehouse', async () => {
  const userId = await insertUser('WhScope', 'whscope@scope-test.local');
  const roleId = await insertRole('WhScopeRole', 'WH_SCOPE_ROLE');
  await grantPermissions(roleId, ['warehouse.view']);
  await assignRole(userId, roleId);
  // Scope the user to Piassa warehouse only; create a warehouse in Megenagna
  // (belongs to different branch) and verify denial.
  const [w2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)',
    [branchMegenagnaId, 'Megenagna Main Warehouse (Test)', 'MMW'],
  );
  await assignScope(userId, 'warehouse', warehousePiassaId);

  const agent = await agentFor('whscope@scope-test.local');
  const allowed = await agent.get(`/api/v1/warehouses/${warehousePiassaId}`);
  assert.equal(allowed.status, 200);

  const denied = await agent.get(`/api/v1/warehouses/${w2.insertId}`);
  assert.equal(denied.status, 403);

  const locationDenied = await agent.get(`/api/v1/storage-locations/${locationPiassaId}`);
  assert.equal(locationDenied.status, 403); // user has no storage_location.view permission
});

// 12–15. All four modules enforce permissions (view denied without permission)
test('organization/branch/warehouse/storage APIs enforce permissions', async () => {
  const userId = await insertUser('Partial', 'partial@scope-test.local');
  const roleId = await insertRole('PartialRole', 'PARTIAL_ROLE');
  await grantPermissions(roleId, ['organization.view']); // no branch/warehouse/location perms
  await assignRole(userId, roleId);
  await assignScope(userId, 'organization', orgPiassaId);

  const agent = await agentFor('partial@scope-test.local');

  assert.equal((await agent.get('/api/v1/organizations')).status, 200);
  assert.equal((await agent.get('/api/v1/branches')).status, 403);
  assert.equal((await agent.get('/api/v1/warehouses')).status, 403);
  assert.equal((await agent.get('/api/v1/storage-locations')).status, 403);

  const createBranch = await agent.post('/api/v1/branches').send({ organizationId: orgPiassaId, name: 'X', code: 'X' });
  assert.equal(createBranch.status, 403);
});

// Extra: /api/v1/auth/me exposes roles + permissions, never password fields
test('auth/me returns effective authorization info without secrets', async () => {
  const userId = await insertUser('MeUser', 'meuser@scope-test.local');
  const roleId = await insertRole('MeRole', 'ME_ROLE');
  await grantPermissions(roleId, ['organization.view']);
  await assignRole(userId, roleId);

  const agent = await agentFor('meuser@scope-test.local');
  const res = await agent.get('/api/v1/auth/me');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.user.roles));
  assert.ok(res.body.data.user.permissions.includes('organization.view'));
  assert.ok(!JSON.stringify(res.body).includes('password'));
  assert.ok(!JSON.stringify(res.body).includes('password_hash'));
});

// Extra: scope-aware list filtering hides out-of-scope records
test('branch list is filtered to the user scope', async () => {
  const userId = await insertUser('ListScope', 'listscope@scope-test.local');
  const roleId = await insertRole('ListScopeRole', 'LIST_SCOPE_ROLE');
  await grantPermissions(roleId, ['branch.view']);
  await assignRole(userId, roleId);
  await assignScope(userId, 'branch', branchMegenagnaId);

  const agent = await agentFor('listscope@scope-test.local');
  const res = await agent.get('/api/v1/branches');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.branches.length, 1);
  assert.equal(res.body.data.branches[0].id, branchMegenagnaId);
});

// Extra: scope-aware denial on create under out-of-scope parent
test('branch creation under out-of-scope organization is denied', async () => {
  const userId = await insertUser('CreateScope', 'createscope@scope-test.local');
  const roleId = await insertRole('CreateScopeRole', 'CREATE_SCOPE_ROLE');
  await grantPermissions(roleId, ['branch.create']);
  await assignRole(userId, roleId);
  await assignScope(userId, 'organization', orgPiassaId);

  const agent = await agentFor('createscope@scope-test.local');
  const res = await agent.post('/api/v1/branches').send({
    organizationId: orgMegenagnaId,
    name: 'Sneaky',
    code: 'SNEAKY',
  });
  assert.equal(res.status, 403);
});

// Extra: user management does not leak passwords
test('user listing never exposes password hashes', async () => {
  const adminId = await insertUser('AdminList', 'adminlist@scope-test.local');
  const roleId = await insertRole('AdminListRole', 'ADMIN_LIST_ROLE');
  await grantPermissions(roleId, ['user.view']);
  await assignRole(adminId, roleId);

  const agent = await agentFor('adminlist@scope-test.local');
  const res = await agent.get('/api/v1/users');
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes('password'));
});
