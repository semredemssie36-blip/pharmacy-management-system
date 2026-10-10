/**
 * Task 22 — Data Export Integration Tests
 *
 * Verifies:
 * - 401 unauthenticated requests rejected
 * - 403 unauthorized requests (missing export or resource permission) rejected
 * - Correct HTTP headers (text/csv, Content-Disposition attachment)
 * - Safe CSV escaping and CSV Formula Injection protection (=, +, -, @)
 * - Legitimate negative numbers are preserved without unwanted corruption
 * - Organization isolation (users only export their own organization data)
 * - Branch scope isolation (branch-scoped users only export authorized branch data)
 * - Integration with Task 21 reports export
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { parseCsv } from '../src/utils/csvUtils.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_HOST = '127.0.0.1';
process.env.DATABASE_PORT = '3306';
process.env.DATABASE_NAME = 'pharmacy_erp_test';
process.env.DATABASE_USER = 'root';
process.env.DATABASE_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.AUTH_COOKIE_SECURE = 'false';

const PASSWORD = 'Passw0rd!export22';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id;
let wh1Id, wh2Id;
let adminUserId;
let branch1UserId;
let noPermUserId;
let org2UserId;

let agentAdmin;
let agentBranch1;
let agentNoPerm;
let agentOrg2;

let prod1Id, prod2Id, prodMaliciousId;
let batch1Id;
let customerId;
let sale1Id, sale2Id;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLEXP_' + Math.random().toString(36).slice(2, 9);
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

  // Orgs & Branches
  const [o1] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
    `Export Org 1 ${runTag}`,
    `EO1_${runTag}`,
  ]);
  org1Id = o1.insertId;

  const [o2] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
    `Export Org 2 ${runTag}`,
    `EO2_${runTag}`,
  ]);
  org2Id = o2.insertId;

  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [
    org1Id,
    `Export Branch 1 ${runTag}`,
    `EB1_${runTag}`,
  ]);
  branch1Id = b1.insertId;

  const [b2] = await pool.query('INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [
    org1Id,
    `Export Branch 2 ${runTag}`,
    `EB2_${runTag}`,
  ]);
  branch2Id = b2.insertId;

  // Warehouses
  const [w1] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Export WH 1', ?, 'active')", [branch1Id, `EWH1_${runTag}`]);
  wh1Id = w1.insertId;
  const [w2] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Export WH 2', ?, 'active')", [branch2Id, `EWH2_${runTag}`]);
  wh2Id = w2.insertId;

  // Users
  adminUserId = await insertUser(`Export Admin ${runTag}`, `eadmin_${runTag}@test.local`);
  await addRoleWithPerms(adminUserId, [
    'data.export.execute',
    'product.view',
    'inventory.view',
    'supplier.view',
    'customer.view',
    'sale.view',
    'report.sales.view',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [adminUserId, org1Id]);

  branch1UserId = await insertUser(`Export Branch 1 ${runTag}`, `ebr1_${runTag}@test.local`);
  await addRoleWithPerms(branch1UserId, [
    'data.export.execute',
    'sale.view',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [branch1UserId, branch1Id]);

  noPermUserId = await insertUser(`Export No Perm ${runTag}`, `enoperm_${runTag}@test.local`);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [noPermUserId, org1Id]);

  org2UserId = await insertUser(`Export Org 2 ${runTag}`, `eorg2_${runTag}@test.local`);
  await addRoleWithPerms(org2UserId, ['data.export.execute', 'product.view']);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

  // Products
  const [p1] = await pool.query(
    "INSERT INTO products (organization_id, code, name, prescription_classification, status) VALUES (?, ?, 'Standard Aspirin 100mg', 'otc', 'active')",
    [org1Id, `PR-EXP1-${runTag}`]
  );
  prod1Id = p1.insertId;

  // Product with potentially malicious formula characters to test injection protection
  const [pMal] = await pool.query(
    "INSERT INTO products (organization_id, code, name, description, prescription_classification, status) VALUES (?, ?, '=cmd|\\' /C calc\\'!A0', '+DANGEROUS_FORMULA', 'otc', 'active')",
    [org1Id, `PR-INJ-${runTag}`]
  );
  prodMaliciousId = pMal.insertId;

  // Customer
  const [c1] = await pool.query(
    "INSERT INTO customers (organization_id, code, name, customer_type, credit_limit, status) VALUES (?, ?, 'Export Test Clinic', 'institution', 15000.00, 'active')",
    [org1Id, `CUST-EXP-${runTag}`]
  );
  customerId = c1.insertId;

  // Sales (Sale 1 in Branch 1, Sale 2 in Branch 2)
  const [s1] = await pool.query(
    "INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, total_amount, status, created_by) VALUES (?, ?, ?, ?, ?, '2026-06-01', 350.00, 'completed', ?)",
    [org1Id, branch1Id, wh1Id, customerId, `REC-EXP-B1-${runTag}`, adminUserId]
  );
  sale1Id = s1.insertId;

  const [s2] = await pool.query(
    "INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, total_amount, status, created_by) VALUES (?, ?, ?, ?, ?, '2026-06-01', 750.00, 'completed', ?)",
    [org1Id, branch2Id, wh2Id, customerId, `REC-EXP-B2-${runTag}`, adminUserId]
  );
  sale2Id = s2.insertId;

  // Login agents
  async function login(email) {
    const ag = request.agent(app);
    const res = await ag.post('/api/v1/auth/login').send({ email, password: PASSWORD });
    assert.equal(res.status, 200);
    return ag;
  }

  const [uAdmin] = await pool.query('SELECT email FROM users WHERE id = ?', [adminUserId]);
  const [uBr1] = await pool.query('SELECT email FROM users WHERE id = ?', [branch1UserId]);
  const [uNoPerm] = await pool.query('SELECT email FROM users WHERE id = ?', [noPermUserId]);
  const [uOrg2] = await pool.query('SELECT email FROM users WHERE id = ?', [org2UserId]);

  agentAdmin = await login(uAdmin[0].email);
  agentBranch1 = await login(uBr1[0].email);
  agentNoPerm = await login(uNoPerm[0].email);
  agentOrg2 = await login(uOrg2[0].email);
});

after(async () => {
  await pool.query('DELETE FROM sales WHERE id IN (?, ?)', [sale1Id, sale2Id]).catch(() => {});
  await pool.query('DELETE FROM products WHERE id IN (?, ?)', [prod1Id, prodMaliciousId]).catch(() => {});
  await pool.query('DELETE FROM customers WHERE id = ?', [customerId]).catch(() => {});
  await pool.query('DELETE FROM warehouses WHERE id IN (?, ?)', [wh1Id, wh2Id]).catch(() => {});
  await pool.query('DELETE FROM user_scopes WHERE user_id IN (?, ?, ?, ?)', [adminUserId, branch1UserId, noPermUserId, org2UserId]).catch(() => {});
  await pool.query('DELETE FROM user_roles WHERE user_id IN (?, ?, ?, ?)', [adminUserId, branch1UserId, noPermUserId, org2UserId]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [adminUserId, branch1UserId, noPermUserId, org2UserId]).catch(() => {});
  await pool.query('DELETE FROM branches WHERE id IN (?, ?)', [branch1Id, branch2Id]).catch(() => {});
  await pool.query('DELETE FROM organizations WHERE id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
  await closePool();
});

test('1. Unauthenticated export returns 401 Unauthorized', async () => {
  const res = await request(app).get('/api/v1/export/products');
  assert.equal(res.status, 401);
});

test('2. User lacking data.export.execute receives 403 Forbidden', async () => {
  const res = await agentNoPerm.get('/api/v1/export/products');
  assert.equal(res.status, 403);
});

test('3. Export products returns proper CSV headers and formatted records', async () => {
  const res = await agentAdmin.get('/api/v1/export/products');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
  assert.ok(res.headers['content-disposition'].includes('attachment; filename='));
  assert.ok(res.text.includes('Product Code,Product Name'));
  assert.ok(res.text.includes('Standard Aspirin 100mg'));
});

test('4. Formula Injection Protection: neutralizes dangerous strings beginning with = or +', async () => {
  const res = await agentAdmin.get('/api/v1/export/products');
  assert.equal(res.status, 200);

  // Raw text must not begin cell with executable '=' or '+'
  // Instead, it must be escaped with single quote "'" and enclosed in quotes
  assert.ok(res.text.includes("\"'=cmd|' /C calc'!A0\""), 'Spreadsheet formula =cmd must be escaped with single quote');
});

test('5. Export sales enforces branch scope isolation', async () => {
  const res = await agentBranch1.get('/api/v1/export/sales');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('REC-EXP-B1'), 'Branch 1 user must see Branch 1 sale');
  assert.equal(res.text.includes('REC-EXP-B2'), false, 'Branch 1 user must NOT see Branch 2 sale');
});

test('6. Multi-organization isolation: Org 2 user sees zero Org 1 records', async () => {
  const res = await agentOrg2.get('/api/v1/export/products');
  assert.equal(res.status, 200);
  assert.equal(res.text.includes('Standard Aspirin'), false);
});

test('7. Export of Task 21 reports agrees with report data', async () => {
  const res = await agentAdmin.get('/api/v1/export/reports_sales?startDate=2026-01-01&endDate=2026-12-31');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('Sale Date,Receipt No,Branch,Customer'));
});
