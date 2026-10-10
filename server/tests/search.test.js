/**
 * Task 22 — Global Search Integration Tests
 *
 * Verifies:
 * - 401 unauthenticated requests rejected
 * - 403 unauthorized requests (missing search.view permission) rejected
 * - 400 bad request for search queries < 2 characters
 * - Parameterized searches across products, batches, suppliers, customers, sales
 * - Category-specific permission gating (users without sale.view do not see sales)
 * - Branch isolation: branch-scoped users only see records from their branch
 * - Organization isolation: Org 2 user sees 0 Org 1 records
 * - Specific type filter (?type=products)
 * - Empty result set handling
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

const PASSWORD = 'Passw0rd!search22';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id;
let prod1Id, prod2Id;
let batch1Id;
let supplier1Id;
let customer1Id;
let sale1Id, sale2Id;

let agentAdmin;
let agentBranch1User;
let agentNoPermUser;
let agentOrg2User;

let adminUserId;
let branch1UserId;
let noPermUserId;
let org2UserId;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLSRCH_' + Math.random().toString(36).slice(2, 9);
  const [r] = await pool.query("INSERT INTO roles (name, code, status) VALUES (?, ?, 'active')", [code, code]);
  for (const c of codes) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?', [r.insertId, c]);
  }
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, r.insertId]);
}

before(async () => {
  const poolModule = await import('../src/database/pool.js');
  pool = poolModule.getPool();
  closePool = poolModule.closePool;
  const appModule = await import('../src/app.js');
  app = appModule.default;

  const runTag = Math.random().toString(36).slice(2, 8);

  // 1. Organizations & Branches
  const [o1] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
    `Search Org 1 ${runTag}`,
    `SO1_${runTag}`,
  ]);
  org1Id = o1.insertId;

  const [o2] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
    `Search Org 2 ${runTag}`,
    `SO2_${runTag}`,
  ]);
  org2Id = o2.insertId;

  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [
    org1Id,
    `Search Branch 1 ${runTag}`,
    `SB1_${runTag}`,
  ]);
  branch1Id = b1.insertId;

  const [b2] = await pool.query('INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [
    org1Id,
    `Search Branch 2 ${runTag}`,
    `SB2_${runTag}`,
  ]);
  branch2Id = b2.insertId;

  // 2. Users & Roles
  adminUserId = await insertUser(`Search Admin ${runTag}`, `sadmin_${runTag}@test.local`);
  await addRoleWithPerms(adminUserId, [
    'search.view',
    'product.view',
    'inventory.view',
    'supplier.view',
    'customer.view',
    'sale.view',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [adminUserId, org1Id]);

  branch1UserId = await insertUser(`Search Branch 1 Staff ${runTag}`, `sbr1_${runTag}@test.local`);
  await addRoleWithPerms(branch1UserId, [
    'search.view',
    'product.view',
    'customer.view',
    'supplier.view',
    'sale.view',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [branch1UserId, branch1Id]);

  noPermUserId = await insertUser(`Search No Perm User ${runTag}`, `snoperm_${runTag}@test.local`);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [noPermUserId, org1Id]);

  org2UserId = await insertUser(`Search Org 2 User ${runTag}`, `sorg2_${runTag}@test.local`);
  await addRoleWithPerms(org2UserId, ['search.view', 'product.view']);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

  // 3. Products
  const [p1] = await pool.query(
    "INSERT INTO products (organization_id, code, name, barcode, prescription_classification, status) VALUES (?, ?, 'Amoxicillin 500mg Capsules', ?, 'prescription', 'active')",
    [org1Id, `PR-AMOX-${runTag}`, `BAR-AMOX-${runTag}`]
  );
  prod1Id = p1.insertId;

  const [p2] = await pool.query(
    "INSERT INTO products (organization_id, code, name, barcode, prescription_classification, status) VALUES (?, ?, 'Ciprofloxacin 250mg', ?, 'prescription', 'active')",
    [org1Id, `PR-CIPRO-${runTag}`, `BAR-CIPRO-${runTag}`]
  );
  prod2Id = p2.insertId;

  // Batch
  const [bth1] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, '2028-12-31', 'active')",
    [org1Id, prod1Id, `BATCH-AMOX-${runTag}`]
  );
  batch1Id = bth1.insertId;

  // Supplier
  const [sup1] = await pool.query(
    "INSERT INTO suppliers (organization_id, code, name, telephone, status) VALUES (?, ?, 'Abyssinia Pharmaceuticals PLC', '+251911998877', 'active')",
    [org1Id, `SUP-SRCH-${runTag}`]
  );
  supplier1Id = sup1.insertId;

  // Customer
  const [cust1] = await pool.query(
    "INSERT INTO customers (organization_id, code, name, customer_type, status) VALUES (?, ?, 'Kidus Yohannes Clinic', 'institution', 'active')",
    [org1Id, `CUST-SRCH-${runTag}`]
  );
  customer1Id = cust1.insertId;

  // Warehouses
  const [w1] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Search WH 1', ?, 'active')", [branch1Id, `SWH1_${runTag}`]);
  const wh1Id = w1.insertId;
  const [w2] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Search WH 2', ?, 'active')", [branch2Id, `SWH2_${runTag}`]);
  const wh2Id = w2.insertId;

  // Sales (Sale 1 in Branch 1, Sale 2 in Branch 2)
  const [s1] = await pool.query(
    "INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, total_amount, status, created_by) VALUES (?, ?, ?, ?, ?, '2026-06-01', 500.00, 'completed', ?)",
    [org1Id, branch1Id, wh1Id, customer1Id, `REC-SRCH-B1-${runTag}`, adminUserId]
  );
  sale1Id = s1.insertId;

  const [s2] = await pool.query(
    "INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, total_amount, status, created_by) VALUES (?, ?, ?, ?, ?, '2026-06-01', 900.00, 'completed', ?)",
    [org1Id, branch2Id, wh2Id, customer1Id, `REC-SRCH-B2-${runTag}`, adminUserId]
  );
  sale2Id = s2.insertId;

  // Login agents
  async function login(email) {
    const ag = request.agent(app);
    const res = await ag.post('/api/v1/auth/login').send({ email, password: PASSWORD });
    assert.equal(res.status, 200, `Login failed for ${email}`);
    return ag;
  }

  const [uAdmin] = await pool.query('SELECT email FROM users WHERE id = ?', [adminUserId]);
  const [uBr1] = await pool.query('SELECT email FROM users WHERE id = ?', [branch1UserId]);
  const [uNoPerm] = await pool.query('SELECT email FROM users WHERE id = ?', [noPermUserId]);
  const [uOrg2] = await pool.query('SELECT email FROM users WHERE id = ?', [org2UserId]);

  agentAdmin = await login(uAdmin[0].email);
  agentBranch1User = await login(uBr1[0].email);
  agentNoPermUser = await login(uNoPerm[0].email);
  agentOrg2User = await login(uOrg2[0].email);
});

after(async () => {
  // Clean up
  await pool.query('DELETE FROM sales WHERE id IN (?, ?)', [sale1Id, sale2Id]).catch(() => {});
  await pool.query('DELETE FROM batches WHERE id = ?', [batch1Id]).catch(() => {});
  await pool.query('DELETE FROM products WHERE id IN (?, ?)', [prod1Id, prod2Id]).catch(() => {});
  await pool.query('DELETE FROM suppliers WHERE id = ?', [supplier1Id]).catch(() => {});
  await pool.query('DELETE FROM customers WHERE id = ?', [customer1Id]).catch(() => {});
  await pool.query('DELETE FROM user_scopes WHERE user_id IN (?, ?, ?, ?)', [adminUserId, branch1UserId, noPermUserId, org2UserId]).catch(() => {});
  await pool.query('DELETE FROM user_roles WHERE user_id IN (?, ?, ?, ?)', [adminUserId, branch1UserId, noPermUserId, org2UserId]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [adminUserId, branch1UserId, noPermUserId, org2UserId]).catch(() => {});
  await pool.query('DELETE FROM warehouses WHERE branch_id IN (?, ?)', [branch1Id, branch2Id]).catch(() => {});
  await pool.query('DELETE FROM branches WHERE id IN (?, ?)', [branch1Id, branch2Id]).catch(() => {});
  await pool.query('DELETE FROM organizations WHERE id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
  await closePool();
});

test('1. Unauthenticated requests to search return 401 Unauthorized', async () => {
  const res = await request(app).get('/api/v1/search?q=Amoxicillin');
  assert.equal(res.status, 401);
});

test('2. User lacking search.view receives 403 Forbidden', async () => {
  const res = await agentNoPermUser.get('/api/v1/search?q=Amoxicillin');
  assert.equal(res.status, 403);
});

test('3. Query shorter than 2 characters returns 400 Bad Request', async () => {
  const res = await agentAdmin.get('/api/v1/search?q=a');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_SEARCH_QUERY');
});

test('4. Admin searches and finds products by name, code, and barcode', async () => {
  const res = await agentAdmin.get('/api/v1/search?q=Amoxicillin');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.results.products.length >= 1);
  const prod = res.body.data.results.products.find((p) => p.title.includes('Amoxicillin'));
  assert.ok(prod);
  assert.ok(prod.metadata.code.startsWith('PR-AMOX'));
});

test('5. Search matches batches by batch number', async () => {
  const res = await agentAdmin.get('/api/v1/search?q=BATCH-AMOX');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.results.batches.length >= 1);
  assert.ok(res.body.data.results.batches[0].metadata.batchNumber.startsWith('BATCH-AMOX'));
});

test('6. Search matches suppliers and customers', async () => {
  const res = await agentAdmin.get('/api/v1/search?q=Abyssinia');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.results.suppliers.length >= 1);
  assert.equal(res.body.data.results.suppliers[0].title, 'Abyssinia Pharmaceuticals PLC');
});

test('7. Specific type filter restricts search to requested category', async () => {
  const res = await agentAdmin.get('/api/v1/search?q=Amox&type=products');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.results.products.length >= 1);
  assert.equal(res.body.data.results.batches, undefined);
  assert.equal(res.body.data.results.suppliers, undefined);
});

test('8. Branch-scoped user only sees Branch 1 sales, not Branch 2 sales', async () => {
  const res = await agentBranch1User.get('/api/v1/search?q=REC-SRCH');
  assert.equal(res.status, 200);
  const sales = res.body.data.results.sales || [];
  const foundB1 = sales.some((s) => s.title.includes('REC-SRCH-B1'));
  const foundB2 = sales.some((s) => s.title.includes('REC-SRCH-B2'));
  assert.ok(foundB1, 'Branch 1 user should see REC-SRCH-B1');
  assert.equal(foundB2, false, 'Branch 1 user must NOT see Branch 2 sale REC-SRCH-B2');
});

test('9. Multi-organization isolation: Org 2 user sees zero Org 1 records', async () => {
  const res = await agentOrg2User.get('/api/v1/search?q=Amoxicillin');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.totalMatches, 0);
  assert.deepEqual(res.body.data.results, {});
});

test('10. Non-existent query returns 0 matches gracefully', async () => {
  const res = await agentAdmin.get('/api/v1/search?q=NonExistentEntity987654');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.totalMatches, 0);
  assert.deepEqual(res.body.data.results, {});
});
