/**
 * Task 07 — Supplier & Customer backend tests.
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

const PASSWORD = 'Passw0rd!x';

let app;
let pool;
let closePool;
let org1Id;
let org2Id;
let agentOrg1All;  // all permissions + org1 scope
let agentOrg2All;  // all permissions + org2 scope
let viewOnlyOrg1;  // supplier.view/customer.view only + org1 scope
let noPermAgent;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRolePerms(userId, codes) {
  const [roleRow] = await pool.query(`INSERT INTO roles (name, code, status) VALUES (?, ?, 'active')`, ['TMP-' + codes.join('-'), 'TMPCODE' + userId + Math.random().toString(36).slice(2, 8)]);
  for (const code of codes) {
    await pool.query(
      'INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?',
      [roleRow.insertId, code],
    );
  }
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRow.insertId]);
}

async function loginAgent(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

function scopeRow(userId, orgId) {
  return pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [userId, orgId]);
}

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('DELETE FROM customer_return_lines');
  await pool.query('DELETE FROM customer_returns');
  await pool.query('DELETE FROM supplier_return_lines');
  await pool.query('DELETE FROM supplier_returns');
  await pool.query('DELETE FROM refunds');
  await pool.query('DELETE FROM payment_allocations');
  await pool.query('DELETE FROM customer_receivables');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM customers');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM role_permissions');
  await pool.query('DELETE FROM roles');
  await pool.query("DELETE FROM users WHERE email LIKE '%@partner-test.local'");
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');

  const [o1] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Partner Org 1', 'ORGP1')");
  const [o2] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Partner Org 2', 'ORGP2')");
  org1Id = o1.insertId;
  org2Id = o2.insertId;

  const u1 = await insertUser('Admin Partner', 'padmin@partner-test.local');
  await addRolePerms(u1, ['supplier.view', 'supplier.create', 'supplier.update', 'supplier.deactivate', 'customer.view', 'customer.create', 'customer.update', 'customer.deactivate']);
  await scopeRow(u1, org1Id);

  const u2 = await insertUser('Org2 Admin', 'porg2@partner-test.local');
  await addRolePerms(u2, ['supplier.view', 'supplier.create', 'supplier.update', 'supplier.deactivate', 'customer.view', 'customer.create', 'customer.update', 'customer.deactivate']);
  await scopeRow(u2, org2Id);

  const u3 = await insertUser('View Only', 'pview@partner-test.local');
  await addRolePerms(u3, ['supplier.view', 'customer.view']);
  await scopeRow(u3, org1Id);

  await insertUser('No Perms', 'pnoperms@partner-test.local');

  agentOrg1All = await loginAgent('padmin@partner-test.local');
  agentOrg2All = await loginAgent('porg2@partner-test.local');
  viewOnlyOrg1 = await loginAgent('pview@partner-test.local');
  noPermAgent = await loginAgent('pnoperms@partner-test.local');
});

after(async () => {
  try {
    if (pool) {
      await pool.query('DELETE FROM customer_return_lines');
      await pool.query('DELETE FROM customer_returns');
      await pool.query('DELETE FROM supplier_return_lines');
      await pool.query('DELETE FROM supplier_returns');
      await pool.query('DELETE FROM refunds');
      await pool.query('DELETE FROM payment_allocations');
      await pool.query('DELETE FROM customer_receivables');
      await pool.query('DELETE FROM payments');
      await pool.query('DELETE FROM customers');
      await pool.query('DELETE FROM suppliers');
      await pool.query('DELETE FROM user_scopes');
      await pool.query('DELETE FROM user_roles');
      await pool.query('DELETE FROM role_permissions');
      await pool.query('DELETE FROM roles');
      await pool.query("DELETE FROM users WHERE email LIKE '%@partner-test.local'");
      await pool.query('DELETE FROM storage_locations');
      await pool.query('DELETE FROM warehouses');
      await pool.query('DELETE FROM branches');
      await pool.query('DELETE FROM organizations');
    }
  } finally {
    if (closePool) await closePool();
  }
});

test('unauthenticated requests → 401 (suppliers and customers)', async () => {
  assert.equal((await request(app).get('/api/v1/suppliers')).status, 401);
  assert.equal((await request(app).get('/api/v1/customers')).status, 401);
});

test('missing permission → 403 on list', async () => {
  assert.equal((await noPermAgent.get('/api/v1/suppliers')).status, 403);
  assert.equal((await noPermAgent.get('/api/v1/customers')).status, 403);
});

test('authorized org scope list returns only org1 rows', async () => {
  const s = await agentOrg1All.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'MedSupply Ethiopia', code: 'MED1', contactPerson: 'Liya', telephone: '0911-111111' });
  assert.equal(s.status, 201);
  const res = await agentOrg1All.get('/api/v1/suppliers');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.total, 1);
  assert.equal(res.body.data.items[0].name, 'MedSupply Ethiopia');

  const res2 = await agentOrg2All.get('/api/v1/suppliers');
  assert.equal(res2.body.data.total, 0);
});

test('supplier create requires supplier.create permission', async () => {
  const res = await viewOnlyOrg1.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'X' });
  assert.equal(res.status, 403);
});

test('customer create requires customer.create permission', async () => {
  const res = await viewOnlyOrg1.post('/api/v1/customers').send({ organizationId: org1Id, name: 'X' });
  assert.equal(res.status, 403);
});

test('duplicate supplier code within the same org is rejected (409)', async () => {
  await agentOrg1All.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'Dup A', code: 'DUP1' });
  const byOrg2 = await agentOrg2All.post('/api/v1/suppliers').send({ organizationId: org2Id, name: 'Dup B', code: 'DUP1' });
  assert.equal(byOrg2.status, 201); // same code, different org is allowed

  const dup = await agentOrg1All.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'Dup A2', code: 'DUP1' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_SUPPLIERS_CODE');
});

test('duplicate customer code within the same org is rejected (409)', async () => {
  await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: 'CD1', code: 'CDP' });
  const dup = await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: 'CD2', code: 'CDP' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_CUSTOMERS_CODE');
});

test('negative customer credit limit rejected', async () => {
  const res = await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: 'Negative Credit', creditLimit: -1 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('zero customer credit limit accepted', async () => {
  const res = await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: 'Zero Credit', creditLimit: 0 });
  assert.equal(res.status, 201);
  assert.equal(Number(res.body.data.customer.credit_limit), 0);
});

test('inactive supplier remains retrievable and its status is inactive', async () => {
  const created = await agentOrg1All.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'Inactive Sup', code: 'INSB' });
  const id = created.body.data.supplier.id;
  await agentOrg1All.post(`/api/v1/suppliers/${id}/deactivate`);
  const res = await agentOrg1All.get(`/api/v1/suppliers/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.supplier.status, 'inactive');
});

test('inactive customer remains retrievable and its status is inactive', async () => {
  const created = await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: 'Inactive Cust', code: 'INCC' });
  const id = created.body.data.customer.id;
  await agentOrg1All.post(`/api/v1/customers/${id}/deactivate`);
  const res = await agentOrg1All.get(`/api/v1/customers/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.customer.status, 'inactive');
});

test('cross-organization supplier/customer detail access returns 403', async () => {
  const s = await agentOrg1All.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'X-Org Sup', code: 'XORG' });
  const c = await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: 'X-Org Cust', code: 'XORG' });
  assert.equal((await agentOrg2All.get(`/api/v1/suppliers/${s.body.data.supplier.id}`)).status, 403);
  assert.equal((await agentOrg2All.get(`/api/v1/customers/${c.body.data.customer.id}`)).status, 403);
});

test('list scoped by organizationId query + search + pagination', async () => {
  const agentsNeeds = ['Alpha Pharmacy Customer', 'Beta Pharmacy Customer', 'Gamma Pharmacy Customer'];
  for (const n of agentsNeeds) {
    // eslint-disable-next-line no-await-in-loop
    await agentOrg1All.post('/api/v1/customers').send({ organizationId: org1Id, name: n, telephone: '0911000000' });
  }
  const searched = await agentOrg1All.get('/api/v1/customers?search=Pharmacy');
  assert.ok(searched.body.data.total >= 3);

  const paged = await agentOrg1All.get('/api/v1/customers?limit=2&page=1&sort=name');
  assert.equal(paged.body.data.items.length, 2);
  assert.ok(paged.body.data.total >= 3);
});

test('supplier activate/deactivate transitions status', async () => {
  const created = await agentOrg1All.post('/api/v1/suppliers').send({ organizationId: org1Id, name: 'Toggle Sup', code: 'TOG' });
  const id = created.body.data.supplier.id;
  await agentOrg1All.post(`/api/v1/suppliers/${id}/deactivate`);
  assert.equal((await agentOrg1All.get(`/api/v1/suppliers/${id}`)).body.data.supplier.status, 'inactive');
  await agentOrg1All.post(`/api/v1/suppliers/${id}/activate`);
  assert.equal((await agentOrg1All.get(`/api/v1/suppliers/${id}`)).body.data.supplier.status, 'active');
});
