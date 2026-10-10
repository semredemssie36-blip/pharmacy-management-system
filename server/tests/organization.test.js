/**
 * Task 03 — Organization / Branch / Warehouse / Storage Location tests.
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
let agent;
let testUserId;

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('DELETE FROM customer_return_lines');
  await pool.query('DELETE FROM customer_returns');
  await pool.query('DELETE FROM supplier_return_lines');
  await pool.query('DELETE FROM supplier_returns');
  await pool.query('DELETE FROM refunds');
  await pool.query('DELETE FROM payment_allocations');
  await pool.query('DELETE FROM customer_receivables');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM role_permissions');
  await pool.query('DELETE FROM roles');
  await pool.query("DELETE FROM users WHERE email = 'orgtest@pharmacy.local'");
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  const [userInsert] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    ['Org Test', 'orgtest@pharmacy.local', await bcrypt.hash('Test12345!', 10), 'active'],
  );
  testUserId = userInsert.insertId;

  // Give the test user a role holding every permission.
  const [roleInsert] = await pool.query("INSERT INTO roles (name, code, description, status) VALUES ('Test All Permissions', 'TEST_ALL_PERMISSIONS', 'test', 'active')");
  await pool.query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions', [roleInsert.insertId]);
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [testUserId, roleInsert.insertId]);

  agent = request.agent(app);
  const login = await agent
    .post('/api/v1/auth/login')
    .send({ email: 'orgtest@pharmacy.local', password: 'Test12345!' });
  assert.equal(login.status, 200);
});

after(async () => {
  try {
    if (pool) {
      await pool.query('SET FOREIGN_KEY_CHECKS = 0');
      await pool.query('DELETE FROM customer_return_lines');
      await pool.query('DELETE FROM customer_returns');
      await pool.query('DELETE FROM supplier_return_lines');
      await pool.query('DELETE FROM supplier_returns');
      await pool.query('DELETE FROM refunds');
      await pool.query('DELETE FROM payment_allocations');
      await pool.query('DELETE FROM customer_receivables');
      await pool.query('DELETE FROM payments');
      await pool.query('DELETE FROM storage_locations');
      await pool.query('DELETE FROM warehouses');
      await pool.query('DELETE FROM branches');
      await pool.query('DELETE FROM organizations');
      await pool.query("DELETE FROM users WHERE email = 'orgtest@pharmacy.local'");
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  } finally {
    if (closePool) await closePool();
  }
});

const authed = () => agent;

async function createOrg(input) {
  const res = await agent.post('/api/v1/organizations').send(input);
  if (res.status === 201) {
    await pool.query(
      "INSERT IGNORE INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)",
      [testUserId, res.body.data.organization.id],
    );
  }
  return res;
}

// 12. Unauthenticated requests are rejected
test('unauthenticated requests to organization APIs are rejected', async () => {
  const res = await request(app).get('/api/v1/organizations');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTHENTICATION_REQUIRED');
});

// 13. Existing authentication still works (covered by login in before)
test('authenticated user can list organizations', async () => {
  const res = await authed().get('/api/v1/organizations');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.organizations));
});

// 14. Versioned health endpoint still works
test('versioned health endpoint still works', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'ok');
});

// 1 & 2. Organization creation + retrieval
test('organization can be created and retrieved', async () => {
  const created = await createOrg({ name: 'Test Organization', code: 'TESTORG' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.organization.code, 'TESTORG');

  const fetched = await authed().get(`/api/v1/organizations/${created.body.data.organization.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.organization.name, 'Test Organization');
});

// 3. Organization update
test('organization can be updated', async () => {
  const created = await createOrg({ name: 'Before Update', code: 'UPDATE_ME' });
  const res = await authed()
    .patch(`/api/v1/organizations/${created.body.data.organization.id}`)
    .send({ name: 'After Update' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.organization.name, 'After Update');
});

// 4. Organization deactivation
test('organization can be deactivated', async () => {
  const created = await createOrg({ name: 'To Deactivate', code: 'DEACTIVATE_ME' });
  const res = await authed().post(`/api/v1/organizations/${created.body.data.organization.id}/deactivate`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.organization.status, 'inactive');
});

// 11. Duplicate identifiers rejected
test('duplicate organization code is rejected', async () => {
  const first = await createOrg({ name: 'One', code: 'DUPCODE' });
  assert.equal(first.status, 201);
  const second = await createOrg({ name: 'Two', code: 'DUPCODE' });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DUPLICATE_ORGANIZATION_CODE');
});

// 5. Branch creation under an organization
test('branch can be created under an organization', async () => {
  const org = await createOrg({ name: 'Branch Parent', code: 'BRANCHPARENT' });
  const res = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: org.body.data.organization.id, name: 'Piassa Branch (test)', code: 'PIASSA' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.branch.organization_id, org.body.data.organization.id);
});

// 6. Branch cannot reference nonexistent organization
test('branch cannot reference a nonexistent organization', async () => {
  const res = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: 999999, name: 'Ghost Branch', code: 'GHOST' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'ORGANIZATION_NOT_FOUND');
});

test('branch cannot be created under an inactive organization', async () => {
  const org = await createOrg({ name: 'Inactive Org', code: 'INACTIVEORG' });
  await authed().post(`/api/v1/organizations/${org.body.data.organization.id}/deactivate`);
  const res = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: org.body.data.organization.id, name: 'X', code: 'X' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'INACTIVE_PARENT');
});

// 7. Warehouse creation under a branch
test('warehouse can be created under a branch', async () => {
  const org = await createOrg({ name: 'WH Org', code: 'WHORG' });
  const branch = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: org.body.data.organization.id, name: 'B1', code: 'B1' });
  const res = await authed()
    .post('/api/v1/warehouses')
    .send({ branchId: branch.body.data.branch.id, name: 'Main Warehouse', code: 'MAIN' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.warehouse.branch_id, branch.body.data.branch.id);
});

// 8. Warehouse cannot reference nonexistent branch
test('warehouse cannot reference a nonexistent branch', async () => {
  const res = await authed().post('/api/v1/warehouses').send({ branchId: 999999, name: 'Ghost', code: 'G' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'BRANCH_NOT_FOUND');
});

// 9. Storage location creation under a warehouse
test('storage location can be created under a warehouse', async () => {
  const org = await createOrg({ name: 'SL Org', code: 'SLORG' });
  const branch = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: org.body.data.organization.id, name: 'B', code: 'B' });
  const warehouse = await authed()
    .post('/api/v1/warehouses')
    .send({ branchId: branch.body.data.branch.id, name: 'W', code: 'W' });
  const res = await authed()
    .post('/api/v1/storage-locations')
    .send({ warehouseId: warehouse.body.data.warehouse.id, name: 'Cold Storage', code: 'COLD', storageCondition: 'refrigerated' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.storageLocation.storage_condition, 'refrigerated');
});

// 10. Storage location cannot reference nonexistent warehouse
test('storage location cannot reference a nonexistent warehouse', async () => {
  const res = await authed()
    .post('/api/v1/storage-locations')
    .send({ warehouseId: 999999, name: 'Ghost', code: 'G' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'WAREHOUSE_NOT_FOUND');
});

test('duplicate branch code in same organization is rejected but allowed in different orgs', async () => {
  const orgA = await createOrg({ name: 'OrgA', code: 'ORGA' });
  const orgB = await createOrg({ name: 'OrgB', code: 'ORGB' });

  const a1 = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: orgA.body.data.organization.id, name: 'Branch A1', code: 'MAIN' });
  assert.equal(a1.status, 201);

  const dup = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: orgA.body.data.organization.id, name: 'Branch A2', code: 'MAIN' });
  assert.equal(dup.status, 409);

  const b1 = await authed()
    .post('/api/v1/branches')
    .send({ organizationId: orgB.body.data.organization.id, name: 'Branch B1', code: 'MAIN' });
  assert.equal(b1.status, 201);
});

test('validation errors are consistent', async () => {
  const res = await createOrg({ name: '', code: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.body.error.details));
});
