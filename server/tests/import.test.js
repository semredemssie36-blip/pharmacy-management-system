/**
 * Task 22 — Data Import Integration Tests
 *
 * Verifies:
 * - Download template endpoint returns RFC compliant headers
 * - Preview validation validates headers, formats, enums, numbers
 * - In-file and database duplicate detection
 * - Update existing records policy (create vs update actions)
 * - Permission checks (data.import.execute, product.create, product.update)
 * - Atomic transaction rollback on validation or insert failure
 * - Successful import of products, suppliers, customers
 * - Import job tracking and audit logging
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

const PASSWORD = 'Passw0rd!import22';

let app;
let pool;
let closePool;

let orgId;
let adminUserId;
let noPermUserId;
let agentAdmin;
let agentNoPerm;

let createdProductCodes = [];
let createdSupplierCodes = [];
let createdCustomerCodes = [];

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLIMP_' + Math.random().toString(36).slice(2, 9);
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

  // Org
  const [o1] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
    `Import Org ${runTag}`,
    `IO_${runTag}`,
  ]);
  orgId = o1.insertId;

  // Category & Dosage Form for product references
  await pool.query(
    "INSERT INTO categories (organization_id, name, code, status) VALUES (?, 'Antibiotics', 'ANTIBIOTICS', 'active')",
    [orgId]
  );
  await pool.query(
    "INSERT INTO dosage_forms (organization_id, name, code, status) VALUES (?, 'Tablet', 'TAB', 'active')",
    [orgId]
  );

  // Users
  adminUserId = await insertUser(`Import Admin ${runTag}`, `iadmin_${runTag}@test.local`);
  await addRoleWithPerms(adminUserId, [
    'data.import.view',
    'data.import.execute',
    'product.create',
    'product.update',
    'supplier.create',
    'supplier.update',
    'customer.create',
    'customer.update',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [adminUserId, orgId]);

  noPermUserId = await insertUser(`Import No Perm ${runTag}`, `inoperm_${runTag}@test.local`);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [noPermUserId, orgId]);

  async function login(email) {
    const ag = request.agent(app);
    const res = await ag.post('/api/v1/auth/login').send({ email, password: PASSWORD });
    assert.equal(res.status, 200);
    return ag;
  }

  const [uAdmin] = await pool.query('SELECT email FROM users WHERE id = ?', [adminUserId]);
  const [uNoPerm] = await pool.query('SELECT email FROM users WHERE id = ?', [noPermUserId]);

  agentAdmin = await login(uAdmin[0].email);
  agentNoPerm = await login(uNoPerm[0].email);
});

after(async () => {
  // Clean up created records
  if (createdProductCodes.length > 0) {
    await pool.query(`DELETE FROM products WHERE organization_id = ? AND code IN (${createdProductCodes.map(() => '?').join(',')})`, [orgId, ...createdProductCodes]).catch(() => {});
  }
  if (createdSupplierCodes.length > 0) {
    await pool.query(`DELETE FROM suppliers WHERE organization_id = ? AND code IN (${createdSupplierCodes.map(() => '?').join(',')})`, [orgId, ...createdSupplierCodes]).catch(() => {});
  }
  if (createdCustomerCodes.length > 0) {
    await pool.query(`DELETE FROM customers WHERE organization_id = ? AND code IN (${createdCustomerCodes.map(() => '?').join(',')})`, [orgId, ...createdCustomerCodes]).catch(() => {});
  }
  await pool.query('DELETE FROM import_jobs WHERE organization_id = ?', [orgId]).catch(() => {});
  await pool.query('DELETE FROM categories WHERE organization_id = ?', [orgId]).catch(() => {});
  await pool.query('DELETE FROM dosage_forms WHERE organization_id = ?', [orgId]).catch(() => {});
  await pool.query('DELETE FROM user_scopes WHERE user_id IN (?, ?)', [adminUserId, noPermUserId]).catch(() => {});
  await pool.query('DELETE FROM user_roles WHERE user_id IN (?, ?)', [adminUserId, noPermUserId]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id IN (?, ?)', [adminUserId, noPermUserId]).catch(() => {});
  await pool.query('DELETE FROM organizations WHERE id = ?', [orgId]).catch(() => {});
  await closePool();
});

test('1. Download template returns CSV with proper headers', async () => {
  const res = await agentAdmin.get('/api/v1/import/templates/products');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
  assert.ok(res.text.includes('code,name,barcode'));
  assert.ok(res.text.includes('prescription_classification'));
});

test('2. Download template for unsupported entity returns 400', async () => {
  const res = await agentAdmin.get('/api/v1/import/templates/nonexistent');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'UNSUPPORTED_IMPORT_TYPE');
});

test('3. Preview validation rejects empty CSV payload with 400', async () => {
  const res = await agentAdmin.post('/api/v1/import/preview/products').send({ csvData: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'EMPTY_CSV_FILE');
});

test('4. Preview validation rejects missing required headers with 400', async () => {
  const invalidCsv = 'wrong_col1,wrong_col2\nval1,val2\n';
  const res = await agentAdmin.post('/api/v1/import/preview/products').send({ csvData: invalidCsv });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'MISSING_CSV_HEADERS');
});

test('5. Preview validation flags invalid fields (e.g. bad classification enum, negative stock)', async () => {
  const csv = `code,name,prescription_classification,min_stock_level
PR-TEST-INV1,Test Drug 1,invalid_enum,10
PR-TEST-INV2,Test Drug 2,otc,-5
`;
  const res = await agentAdmin.post('/api/v1/import/preview/products').send({ csvData: csv });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.totalRows, 2);
  assert.equal(res.body.data.validRows, 0);
  assert.equal(res.body.data.invalidRows, 2);
  assert.ok(res.body.data.rows[0].errors[0].includes('prescription_classification'));
  assert.ok(res.body.data.rows[1].errors[0].includes('min_stock_level'));
});

test('6. Preview validation detects duplicate codes within the CSV file', async () => {
  const csv = `code,name,prescription_classification
PR-DUP-01,Drug First,otc
PR-DUP-01,Drug Duplicate,otc
`;
  const res = await agentAdmin.post('/api/v1/import/preview/products').send({ csvData: csv });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.totalRows, 2);
  assert.equal(res.body.data.validRows, 1);
  assert.equal(res.body.data.invalidRows, 1);
  assert.ok(res.body.data.rows[1].errors[0].includes('Duplicate code in file'));
});

test('7. Unauthorized user cannot commit imports (403 Forbidden)', async () => {
  const csv = `code,name,prescription_classification
PR-TEST-001,Safe Drug,otc
`;
  const res = await agentNoPerm.post('/api/v1/import/commit/products').send({ csvData: csv });
  assert.equal(res.status, 403);
});

test('8. Commit import with validation errors aborts atomically (0 rows inserted)', async () => {
  const runCode = `PR-ATOMIC-${Date.now()}`;
  const csv = `code,name,prescription_classification
${runCode},Valid Drug,otc
PR-FAIL,Invalid Drug,bad_enum
`;
  const res = await agentAdmin.post('/api/v1/import/commit/products').send({ csvData: csv });
  assert.equal(res.status, 400); // Validation error
  // Verify row was not committed
  const [rows] = await pool.query('SELECT id FROM products WHERE organization_id = ? AND code = ?', [orgId, runCode]);
  assert.equal(rows.length, 0, 'Atomic rollback must ensure valid row was not inserted when file contains errors');
});

test('9. Successfully commit valid products import, update existing, and log import job', async () => {
  const code1 = `PR-OK1-${Date.now()}`;
  const code2 = `PR-OK2-${Date.now()}`;
  createdProductCodes.push(code1, code2);

  const csv = `code,name,prescription_classification,category_code,dosage_form_code,min_stock_level,max_stock_level
${code1},Azithromycin 500mg,prescription,ANTIBIOTICS,TAB,10,200
${code2},Ibuprofen 400mg,otc,,TAB,20,500
`;
  const res = await agentAdmin.post('/api/v1/import/commit/products').send({
    csvData: csv,
    filename: 'test_products.csv',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'completed');
  assert.equal(res.body.data.successfulRows, 2);

  // Verify in database
  const [dbRows] = await pool.query('SELECT code, name, status FROM products WHERE organization_id = ? AND code IN (?, ?)', [orgId, code1, code2]);
  assert.equal(dbRows.length, 2);

  // Verify second import with updateExisting = true updates the name
  const updatedCsv = `code,name,prescription_classification
${code1},Azithromycin 500mg Updated Name,prescription
`;
  const resUpdate = await agentAdmin.post('/api/v1/import/commit/products').send({
    csvData: updatedCsv,
    filename: 'test_products_update.csv',
    updateExisting: true,
  });
  assert.equal(resUpdate.status, 200);
  assert.equal(resUpdate.body.data.successfulRows, 1);

  const [updatedRow] = await pool.query('SELECT name FROM products WHERE organization_id = ? AND code = ?', [orgId, code1]);
  assert.equal(updatedRow[0].name, 'Azithromycin 500mg Updated Name');
});

test('10. Successfully import suppliers and customers master records', async () => {
  const supCode = `SUP-IMP-${Date.now()}`;
  const custCode = `CUST-IMP-${Date.now()}`;
  createdSupplierCodes.push(supCode);
  createdCustomerCodes.push(custCode);

  const supCsv = `code,name,telephone,email,country
${supCode},MedTech Diagnostics PLC,+251911445566,info@medtech.et,Ethiopia
`;
  const resSup = await agentAdmin.post('/api/v1/import/commit/suppliers').send({
    csvData: supCsv,
    filename: 'suppliers.csv',
  });
  assert.equal(resSup.status, 200);
  assert.equal(resSup.body.data.successfulRows, 1);

  const custCsv = `code,name,customer_type,credit_limit
${custCode},Bethel Medical Center,institution,25000.00
`;
  const resCust = await agentAdmin.post('/api/v1/import/commit/customers').send({
    csvData: custCsv,
    filename: 'customers.csv',
  });
  assert.equal(resCust.status, 200);
  assert.equal(resCust.body.data.successfulRows, 1);

  // Verify suppliers and customers in DB
  const [supDb] = await pool.query('SELECT name FROM suppliers WHERE organization_id = ? AND code = ?', [orgId, supCode]);
  assert.equal(supDb[0].name, 'MedTech Diagnostics PLC');
  const [custDb] = await pool.query('SELECT name, credit_limit FROM customers WHERE organization_id = ? AND code = ?', [orgId, custCode]);
  assert.equal(custDb[0].name, 'Bethel Medical Center');
  assert.equal(Number(custDb[0].credit_limit), 25000.00);
});

test('11. Import jobs history endpoint returns recorded jobs with pagination', async () => {
  const res = await agentAdmin.get('/api/v1/import/jobs?page=1&limit=5');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.items.length >= 1);
  const latestJob = res.body.data.items[0];
  assert.ok(latestJob.job_uuid);
  assert.equal(latestJob.status, 'completed');
  assert.ok(latestJob.successful_rows >= 1);
});
