/**
 * Task 10 — Sales / POS comprehensive tests.
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

let org1Id, org2Id, branch1Id, branch2Id, warehouse1Id, warehouse2Id, location1Id;
let customerActiveId, customerInactiveId, customerOrg2Id;
let product1Id, product2Id, productInactiveId, productOrg2Id;
let unitBaseId, unitStripId;
let batchEarlyId, batchLateId, batchExpiredId;
let invEarlyId, invLateId, invExpiredId;

let agentAdmin;
let agentCashier;
let agentViewOnly;
let agentOrg2;
let agentNoPerms;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function roleWithPermissions(codes) {
  const code = 'SLR' + Math.random().toString(36).slice(2, 10);
  const [r] = await pool.query("INSERT INTO roles (name, code, status) VALUES (?, ?, 'active')", [code, code]);
  for (const c of codes) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?', [r.insertId, c]);
  }
  return r.insertId;
}

async function loginAgent(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return agent;
}

before(async () => {
  const { runMigrations } = await import('../src/database/migrate.js');
  await runMigrations();

  const poolMod = await import('../src/database/pool.js');
  pool = poolMod.getPool();
  closePool = poolMod.closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('DELETE FROM customer_return_lines');
  await pool.query('DELETE FROM customer_returns');
  await pool.query('DELETE FROM supplier_return_lines');
  await pool.query('DELETE FROM supplier_returns');
  await pool.query('DELETE FROM refunds');
  await pool.query('DELETE FROM payment_allocations');
  await pool.query('DELETE FROM customer_receivables');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM sale_batch_allocations');
  await pool.query('DELETE FROM sale_lines');
  await pool.query('DELETE FROM sales');
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM purchase_order_lines');
  await pool.query('DELETE FROM purchase_orders');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM product_unit_conversions');
  await pool.query('DELETE FROM product_units');
  await pool.query('DELETE FROM products');
  await pool.query('DELETE FROM customers');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM units');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM role_permissions');
  await pool.query('DELETE FROM roles');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  // Organizations
  const [o1] = await pool.query("INSERT INTO organizations (name, code, status) VALUES ('Sales Org 1', 'SORG1', 'active')");
  org1Id = o1.insertId;
  const [o2] = await pool.query("INSERT INTO organizations (name, code, status) VALUES ('Sales Org 2', 'SORG2', 'active')");
  org2Id = o2.insertId;

  // Branches
  const [b1] = await pool.query("INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Branch 1', 'SBR1', 'active')", [org1Id]);
  branch1Id = b1.insertId;
  const [b2] = await pool.query("INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Branch 2', 'SBR2', 'active')", [org2Id]);
  branch2Id = b2.insertId;

  // Warehouses
  const [w1] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Warehouse 1', 'SWH1', 'active')", [branch1Id]);
  warehouse1Id = w1.insertId;
  const [w2] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Warehouse 2', 'SWH2', 'active')", [branch2Id]);
  warehouse2Id = w2.insertId;

  // Storage location
  const [sl1] = await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, 'Aisle 1', 'SLOC1', 'active')", [warehouse1Id]);
  location1Id = sl1.insertId;

  // Customers
  const [cAct] = await pool.query("INSERT INTO customers (organization_id, name, telephone, status) VALUES (?, 'Jane Doe', '0911000001', 'active')", [org1Id]);
  customerActiveId = cAct.insertId;
  const [cInact] = await pool.query("INSERT INTO customers (organization_id, name, telephone, status) VALUES (?, 'Inactive Guy', '0911000002', 'inactive')", [org1Id]);
  customerInactiveId = cInact.insertId;
  const [cO2] = await pool.query("INSERT INTO customers (organization_id, name, telephone, status) VALUES (?, 'Org2 Customer', '0911000003', 'active')", [org2Id]);
  customerOrg2Id = cO2.insertId;

  // Units
  const [u1] = await pool.query("INSERT INTO units (organization_id, name, code, status) VALUES (?, 'Tablet', 'TAB', 'active')", [org1Id]);
  unitBaseId = u1.insertId;
  const [u2] = await pool.query("INSERT INTO units (organization_id, name, code, status) VALUES (?, 'Strip', 'STRP', 'active')", [org1Id]);
  unitStripId = u2.insertId;

  // Products
  const [p1] = await pool.query(
    "INSERT INTO products (organization_id, code, barcode, name, prescription_classification, selling_price, status) VALUES (?, 'MED1', '123456789', 'Paracetamol 500mg', 'otc', 20.00, 'active')",
    [org1Id],
  );
  product1Id = p1.insertId;

  const [p2] = await pool.query(
    "INSERT INTO products (organization_id, code, barcode, name, prescription_classification, selling_price, status) VALUES (?, 'MED2', '987654321', 'Amoxicillin 250mg', 'prescription', 50.00, 'active')",
    [org1Id],
  );
  product2Id = p2.insertId;

  const [pInact] = await pool.query(
    "INSERT INTO products (organization_id, code, name, prescription_classification, selling_price, status) VALUES (?, 'MED_INACT', 'Banned Medicine', 'otc', 10.00, 'inactive')",
    [org1Id],
  );
  productInactiveId = pInact.insertId;

  const [pO2] = await pool.query(
    "INSERT INTO products (organization_id, code, name, prescription_classification, selling_price, status) VALUES (?, 'MED_O2', 'Other Org Drug', 'otc', 30.00, 'active')",
    [org2Id],
  );
  productOrg2Id = pO2.insertId;

  // Product Units
  await pool.query("INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)", [product1Id, unitBaseId]);
  await pool.query("INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 0, 1)", [product1Id, unitStripId]);
  // 1 Strip = 10 Tablets
  await pool.query("INSERT INTO product_unit_conversions (product_id, from_unit_id, to_unit_id, factor) VALUES (?, ?, ?, 10)", [product1Id, unitStripId, unitBaseId]);

  // Inventory Batches for Product 1:
  // Batch 1: Early Expiry (e.g. +3 months) - 100 units
  const earlyExp = new Date();
  earlyExp.setMonth(earlyExp.getMonth() + 3);
  const [bEarly] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-EARLY', ?, 'active')",
    [org1Id, product1Id, earlyExp.toISOString().split('T')[0]],
  );
  batchEarlyId = bEarly.insertId;

  const [iEarly] = await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 15.0)",
    [org1Id, branch1Id, warehouse1Id, location1Id, product1Id, batchEarlyId, unitBaseId],
  );
  invEarlyId = iEarly.insertId;

  // Batch 2: Late Expiry (e.g. +12 months) - 100 units
  const lateExp = new Date();
  lateExp.setFullYear(lateExp.getFullYear() + 1);
  const [bLate] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-LATE', ?, 'active')",
    [org1Id, product1Id, lateExp.toISOString().split('T')[0]],
  );
  batchLateId = bLate.insertId;

  const [iLate] = await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 50.0)",
    [org1Id, branch1Id, warehouse1Id, location1Id, product1Id, batchLateId, unitBaseId],
  );
  invLateId = iLate.insertId;

  // Batch 3: Expired batch (-1 month)
  const expPast = new Date();
  expPast.setMonth(expPast.getMonth() - 1);
  const [bExp] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-EXPIRED', ?, 'active')",
    [org1Id, product1Id, expPast.toISOString().split('T')[0]],
  );
  batchExpiredId = bExp.insertId;

  const [iExp] = await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 30.0)",
    [org1Id, branch1Id, warehouse1Id, location1Id, product1Id, batchExpiredId, unitBaseId],
  );
  invExpiredId = iExp.insertId;

  // Create Users & Roles
  // Admin: full access
  const adminRoleId = await roleWithPermissions([
    'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete', 'sale.cancel', 'sale.void',
  ]);
  const uAdminId = await insertUser('Admin Sales', 'admin_sales@test.com');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [uAdminId, adminRoleId]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdminId, org1Id]);
  agentAdmin = await loginAgent('admin_sales@test.com');

  // Cashier: sale.view, sale.create, sale.update, sale.confirm, sale.complete, sale.cancel (no sale.void)
  const cashierRoleId = await roleWithPermissions([
    'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete', 'sale.cancel',
  ]);
  const uCashierId = await insertUser('Cashier User', 'cashier_sales@test.com');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [uCashierId, cashierRoleId]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [uCashierId, branch1Id]);
  agentCashier = await loginAgent('cashier_sales@test.com');

  // View Only
  const viewRoleId = await roleWithPermissions(['sale.view']);
  const uViewId = await insertUser('View User', 'view_sales@test.com');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [uViewId, viewRoleId]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uViewId, org1Id]);
  agentViewOnly = await loginAgent('view_sales@test.com');

  // Org2 User
  const uOrg2Id = await insertUser('Org2 User', 'org2_sales@test.com');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [uOrg2Id, adminRoleId]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uOrg2Id, org2Id]);
  agentOrg2 = await loginAgent('org2_sales@test.com');

  // No perms user
  const uNoPermsId = await insertUser('No Perms', 'noperms_sales@test.com');
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uNoPermsId, org1Id]);
  agentNoPerms = await loginAgent('noperms_sales@test.com');
});

after(async () => {
  if (pool) {
    await pool.query('DELETE FROM customer_return_lines');
    await pool.query('DELETE FROM customer_returns');
    await pool.query('DELETE FROM supplier_return_lines');
    await pool.query('DELETE FROM supplier_returns');
    await pool.query('DELETE FROM refunds');
    await pool.query('DELETE FROM payment_allocations');
    await pool.query('DELETE FROM customer_receivables');
    await pool.query('DELETE FROM payments');
    await pool.query('DELETE FROM sale_batch_allocations');
    await pool.query('DELETE FROM sale_lines');
    await pool.query('DELETE FROM sales');
    await pool.query('DELETE FROM stock_movements');
    await pool.query('DELETE FROM inventory');
    await pool.query('DELETE FROM batches');
    await pool.query('DELETE FROM product_unit_conversions');
    await pool.query('DELETE FROM product_units');
    await pool.query('DELETE FROM products');
  }
  if (closePool) await closePool();
});

// ==========================================
// 1. AUTHENTICATION & PERMISSIONS
// ==========================================
test('AUTH: unauthenticated request is rejected with 401', async () => {
  const res = await request(app).get('/api/v1/sales');
  assert.equal(res.status, 401);
});

test('PERMISSIONS: sale.view denied returns 403', async () => {
  const res = await agentNoPerms.get('/api/v1/sales');
  assert.equal(res.status, 403);
});

test('PERMISSIONS: sale.create denied returns 403', async () => {
  const res = await agentViewOnly.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 403);
});

test('PERMISSIONS: sale.void denied returns 403 for cashier without sale.void', async () => {
  const res = await agentCashier.post('/api/v1/sales/9999/void').send({ reason: 'Mistake' });
  assert.equal(res.status, 403);
});

// ==========================================
// 2. SCOPE VALIDATION
// ==========================================
test('SCOPE: user cannot create sale in unauthorized organization', async () => {
  const res = await agentOrg2.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 403);
});

test('SCOPE: user cannot access customer of another organization', async () => {
  const res = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    customerId: customerOrg2Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

// ==========================================
// 3. CUSTOMER VALIDATION
// ==========================================
test('CUSTOMER: inactive customer rejected for new sale', async () => {
  const res = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    customerId: customerInactiveId,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CUSTOMER_INACTIVE');
});

test('CUSTOMER: anonymous walk-in sale allowed (null customerId)', async () => {
  const res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    customerId: null,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 2 }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.sale.customer_id, null);
  assert.equal(res.body.data.sale.status, 'draft');
});

// ==========================================
// 4. PRODUCT & LINE VALIDATION
// ==========================================
test('PRODUCT: inactive product rejected', async () => {
  const res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: productInactiveId, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PRODUCT_INACTIVE');
});

test('PRODUCT: non-existent product rejected', async () => {
  const res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: 999999, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 404);
});

test('QUANTITY: zero or negative quantity rejected', async () => {
  const resZero = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 0 }],
  });
  assert.equal(resZero.status, 400);

  const resNeg = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: -5 }],
  });
  assert.equal(resNeg.status, 400);
});

// ==========================================
// 5. SERVER-AUTHORITATIVE PRICING & TOTALS
// ==========================================
test('PRICING: server calculates subtotal and total, client-submitted total ignored', async () => {
  // Product 1 selling price is 20.00. 3 units = 60.00.
  // Client attempts to sneak in total_amount = 5.00
  const res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    total_amount: 5.00,
    subtotal: 5.00,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 3, line_total: 5.00 }],
  });
  assert.equal(res.status, 201);
  const sale = res.body.data.sale;
  assert.equal(Number(sale.subtotal), 60.00);
  assert.equal(Number(sale.total_amount), 60.00);
  assert.equal(Number(sale.lines[0].line_total), 60.00);
});

test('DISCOUNTS: discount cannot exceed subtotal', async () => {
  const res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    discountAmount: 100.00, // Subtotal is 20.00
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 400);
});

test('DISCOUNTS: cashier discount > 15% without override rejected', async () => {
  // 1 unit @ 20.00. 15% = 3.00. Cashier tries 5.00 (25%)
  const res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    discountAmount: 5.00,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EXCESS_DISCOUNT_UNAUTHORIZED');
});

test('DISCOUNTS: admin can authorize discount > 15%', async () => {
  const res = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    discountAmount: 5.00,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  assert.equal(res.status, 201);
  const sale = res.body.data.sale;
  assert.equal(Number(sale.discount_amount), 5.00);
  assert.equal(Number(sale.total_amount), 15.00);
});

// ==========================================
// 6. SALE LIFECYCLE & IMMUTABILITY
// ==========================================
test('LIFECYCLE: draft -> confirmed -> payment_pending -> complete happy path', async () => {
  // 1. Create draft
  const createRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    customerId: customerActiveId,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 2 }],
  });
  assert.equal(createRes.status, 201);
  const saleId = createRes.body.data.sale.id;
  assert.equal(createRes.body.data.sale.status, 'draft');

  // 2. Confirm
  const confirmRes = await agentCashier.post(`/api/v1/sales/${saleId}/confirm`).send();
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.data.sale.status, 'confirmed');

  // 3. Payment Pending
  const pendingRes = await agentCashier.post(`/api/v1/sales/${saleId}/payment-pending`).send();
  assert.equal(pendingRes.status, 200);
  assert.equal(pendingRes.body.data.sale.status, 'payment_pending');

  // 4. Complete
  const completeRes = await agentCashier.post(`/api/v1/sales/${saleId}/complete`).send();
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.data.sale.status, 'completed');

  // 5. Completed sale is immutable: patch returns 409
  const patchRes = await agentCashier.patch(`/api/v1/sales/${saleId}`).send({
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 5 }],
  });
  assert.equal(patchRes.status, 409);
  assert.equal(patchRes.body.error.code, 'SALE_NOT_DRAFT');

  // 6. Cancel returns 409
  const cancelRes = await agentCashier.post(`/api/v1/sales/${saleId}/cancel`).send({ reason: 'cancel' });
  assert.equal(cancelRes.status, 409);
  assert.equal(cancelRes.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('LIFECYCLE: draft sale can be cancelled', async () => {
  const createRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  const saleId = createRes.body.data.sale.id;

  const cancelRes = await agentCashier.post(`/api/v1/sales/${saleId}/cancel`).send({ reason: 'Customer changed mind' });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.sale.status, 'cancelled');
  assert.equal(cancelRes.body.data.sale.cancelled_reason, 'Customer changed mind');
});

// ==========================================
// 7. FEFO BATCH ALLOCATION & STOCK DEDUCTION
// ==========================================
test('FEFO: sale allocates earliest expiry batch first, and moves to next batch if needed', async () => {
  // Check starting inventory:
  // Early batch has 15.0 - 2 (from previous test) = 13.0
  // Late batch has 50.0
  // Let's create a sale for 15 units.
  // It should consume ALL remaining 13 units of Early Batch, and 2 units of Late Batch!
  const createRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 15 }],
  });
  const saleId = createRes.body.data.sale.id;

  // Confirm and complete
  await agentCashier.post(`/api/v1/sales/${saleId}/confirm`).send();
  const compRes = await agentCashier.post(`/api/v1/sales/${saleId}/complete`).send();
  assert.equal(compRes.status, 200);

  const lines = compRes.body.data.sale.lines;
  assert.equal(lines.length, 1);
  const allocations = lines[0].allocations;
  assert.equal(allocations.length, 2, 'Should split across 2 batches');

  // Allocation 1 should be the early batch
  assert.equal(allocations[0].batch_number, 'BATCH-EARLY');
  assert.equal(Number(allocations[0].quantity), 13.0);

  // Allocation 2 should be the late batch
  assert.equal(allocations[1].batch_number, 'BATCH-LATE');
  assert.equal(Number(allocations[1].quantity), 2.0);

  // Check inventory table in DB
  const [invRows] = await pool.query('SELECT batch_id, quantity FROM inventory WHERE id IN (?, ?)', [invEarlyId, invLateId]);
  const earlyInv = invRows.find((r) => r.batch_id === batchEarlyId);
  const lateInv = invRows.find((r) => r.batch_id === batchLateId);
  assert.equal(Number(earlyInv.quantity), 0.0);
  assert.equal(Number(lateInv.quantity), 48.0);

  // Check stock movements table: 2 negative movements referencing the sale
  const [movements] = await pool.query(
    'SELECT * FROM stock_movements WHERE reference_type = "sale" AND reference_id = ? ORDER BY id ASC',
    [saleId],
  );
  assert.equal(movements.length, 2);
  assert.equal(movements[0].movement_type, 'sale');
  assert.equal(Number(movements[0].quantity_delta), -13.0);
  assert.equal(movements[1].movement_type, 'sale');
  assert.equal(Number(movements[1].quantity_delta), -2.0);
});

test('FEFO: expired batch is excluded from sale allocation', async () => {
  // Late batch has 48 available. Expired batch has 30.
  // Requesting 49 should fail because expired stock is never available!
  const createRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 49 }],
  });
  assert.equal(createRes.status, 201);
  const saleId = createRes.body.data.sale.id;

  const confRes = await agentCashier.post(`/api/v1/sales/${saleId}/confirm`).send();
  assert.equal(confRes.status, 409);
  assert.equal(confRes.body.error.code, 'INSUFFICIENT_STOCK');
});

// ==========================================
// 8. VOIDING COMPLETED SALE & STOCK REVERSAL
// ==========================================
test('VOID: voiding completed sale restores inventory and writes reversal stock movements', async () => {
  // Create a 5-unit sale
  const createRes = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 5 }],
  });
  const saleId = createRes.body.data.sale.id;
  await agentAdmin.post(`/api/v1/sales/${saleId}/confirm`).send();
  await agentAdmin.post(`/api/v1/sales/${saleId}/complete`).send();

  // Stock in late batch was 48, now 43
  const [invBefore] = await pool.query('SELECT quantity FROM inventory WHERE id = ?', [invLateId]);
  assert.equal(Number(invBefore[0].quantity), 43.0);

  // Void without reason fails validation
  const noReasonRes = await agentAdmin.post(`/api/v1/sales/${saleId}/void`).send({});
  assert.equal(noReasonRes.status, 400);

  // Void with reason
  const voidRes = await agentAdmin.post(`/api/v1/sales/${saleId}/void`).send({ reason: 'Accidental duplicate entry' });
  assert.equal(voidRes.status, 200);
  assert.equal(voidRes.body.data.sale.status, 'voided');
  assert.equal(voidRes.body.data.sale.void_reason, 'Accidental duplicate entry');

  // Stock in late batch restored to 48
  const [invAfter] = await pool.query('SELECT quantity FROM inventory WHERE id = ?', [invLateId]);
  assert.equal(Number(invAfter[0].quantity), 48.0);

  // Reversal stock movement recorded
  const [revMovements] = await pool.query(
    'SELECT * FROM stock_movements WHERE reference_type = "sale" AND reference_id = ? AND quantity_delta > 0',
    [saleId],
  );
  assert.equal(revMovements.length, 1);
  assert.equal(Number(revMovements[0].quantity_delta), 5.0);
});

// ==========================================
// 9. RECEIPT DATA STRUCTURE
// ==========================================
test('RECEIPT: structured receipt endpoint returns all required receipt fields', async () => {
  const createRes = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    customerId: customerActiveId,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  const saleId = createRes.body.data.sale.id;
  await agentAdmin.post(`/api/v1/sales/${saleId}/confirm`).send();
  await agentAdmin.post(`/api/v1/sales/${saleId}/complete`).send();

  const receiptRes = await agentAdmin.get(`/api/v1/sales/${saleId}/receipt`);
  assert.equal(receiptRes.status, 200);
  const r = receiptRes.body.data.receipt;
  assert.ok(r.saleNumber);
  assert.ok(r.branch.name);
  assert.ok(r.cashier.name);
  assert.equal(r.customer.name, 'Jane Doe');
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].productName, 'Paracetamol 500mg');
  assert.equal(r.lines[0].batches.length, 1);
});

// ==========================================
// 10. POS PRODUCT & BARCODE SEARCH
// ==========================================
test('POS SEARCH: fast barcode and name lookup with stock indicators', async () => {
  // Search by exact barcode
  const barcodeRes = await agentCashier.get('/api/v1/pos/products/search?q=123456789&branchId=' + branch1Id);
  assert.equal(barcodeRes.status, 200);
  const prods = barcodeRes.body.data.products;
  assert.ok(prods.length > 0);
  assert.equal(prods[0].barcode, '123456789');
  assert.equal(prods[0].isExactBarcode, true);
  assert.ok(prods[0].availableQuantity > 0);

  // Search by keyword
  const nameRes = await agentCashier.get('/api/v1/pos/products/search?q=Amoxicillin&branchId=' + branch1Id);
  assert.equal(nameRes.status, 200);
  assert.ok(nameRes.body.data.products.some((p) => p.code === 'MED2'));
});

// ==========================================
// 11. CONCURRENCY & ATOMIC ROLLBACK
// ==========================================
test('CONCURRENCY: simultaneous completion cannot oversell limited stock', async () => {
  // Create a separate product with exactly 10 units in stock
  const [pC] = await pool.query(
    "INSERT INTO products (organization_id, code, name, prescription_classification, selling_price, status) VALUES (?, 'CONCURR_1', 'Concurrency Med', 'otc', 10.00, 'active')",
    [org1Id],
  );
  const cProdId = pC.insertId;
  await pool.query("INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)", [cProdId, unitBaseId]);

  const fExp = new Date();
  fExp.setFullYear(fExp.getFullYear() + 2);
  const [bC] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-CONCURR', ?, 'active')",
    [org1Id, cProdId, fExp.toISOString().split('T')[0]],
  );
  const cBatchId = bC.insertId;

  await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 10.0)",
    [org1Id, branch1Id, warehouse1Id, location1Id, cProdId, cBatchId, unitBaseId],
  );

  // Create two draft sales: one for 7 units, one for 5 units (total 12 units > 10 available)
  const resA = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: cProdId, unitId: unitBaseId, quantity: 7 }],
  });
  const saleAId = resA.body.data.sale.id;
  await agentAdmin.post(`/api/v1/sales/${saleAId}/confirm`).send();

  const resB = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    lines: [{ productId: cProdId, unitId: unitBaseId, quantity: 5 }],
  });
  const saleBId = resB.body.data.sale.id;
  await agentAdmin.post(`/api/v1/sales/${saleBId}/confirm`).send();

  // Simultaneously attempt to complete both sales
  const [compA, compB] = await Promise.all([
    agentAdmin.post(`/api/v1/sales/${saleAId}/complete`).send(),
    agentAdmin.post(`/api/v1/sales/${saleBId}/complete`).send(),
  ]);

  const statuses = [compA.status, compB.status].sort();
  // Exactly one must succeed (200) and one must fail (409)
  assert.deepEqual(statuses, [200, 409]);

  // Check database stock: must be >= 0 (e.g. 10 - 7 = 3 or 10 - 5 = 5)
  const [invRows] = await pool.query('SELECT quantity FROM inventory WHERE product_id = ? AND batch_id = ?', [cProdId, cBatchId]);
  const remaining = Number(invRows[0].quantity);
  assert.ok(remaining >= 0, 'Stock cannot be negative');
  assert.ok(remaining === 3 || remaining === 5, 'Remaining must match successful sale');
});
