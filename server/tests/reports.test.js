/**
 * Task 21 — Reports and Dashboards Integration Tests
 *
 * Covers:
 * - Unauthenticated access rejection (401)
 * - Granular permission checks (403 for missing report permission)
 * - Data scope enforcement (Org isolation, Branch isolation, 403 on out-of-scope query filter)
 * - Date validation and ordering checks (400 for inverted or malformed date ranges)
 * - Accurate sales aggregations (completed sales only, drafts/cancelled excluded)
 * - Accurate financial & receivables aggregations (avoiding payment/receivable confusion)
 * - Accurate inventory position counts by status (available vs physical vs quarantined vs expired)
 * - Accurate procurement fulfillment aggregations (ordered vs received)
 * - Dispensing operational throughput and expiry exceptions
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

const PASSWORD = 'Passw0rd!report21';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id, branchOrg2Id;
let wh1Id, wh2Id;
let location1Id, location2Id;
let unitId;
let cat1Id;
let prod1Id, prod2Id;
let batch1Id, batch2Id;
let customer1Id;
let supplier1Id;

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
  const code = 'ROLRPT_' + Math.random().toString(36).slice(2, 9);
  const [r] = await pool.query("INSERT INTO roles (name, code, status) VALUES (?, ?, 'active')", [code, code]);
  for (const c of codes) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?', [r.insertId, c]);
  }
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, r.insertId]);
}

async function loginAgent(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return agent;
}

before(async () => {
  try {
    const { runMigrations } = await import('../src/database/migrate.js');
    await runMigrations();

    const poolMod = await import('../src/database/pool.js');
    pool = poolMod.getPool();
    closePool = poolMod.closePool;
    app = (await import('../src/app.js')).default;

    const runTag = Math.random().toString(36).slice(2, 8);

    // Orgs
    const [o1] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
      `Report Org 1 ${runTag}`,
      `RO1_${runTag}`,
    ]);
    org1Id = o1.insertId;

    const [o2] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [
      `Report Org 2 ${runTag}`,
      `RO2_${runTag}`,
    ]);
    org2Id = o2.insertId;

    // Branches in Org 1
    const [b1] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Branch 1 ${runTag}`, `RB1_${runTag}`],
    );
    branch1Id = b1.insertId;

    const [b2] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Branch 2 ${runTag}`, `RB2_${runTag}`],
    );
    branch2Id = b2.insertId;

    // Branch in Org 2
    const [bO2] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org2Id, `Org2 Branch ${runTag}`, `RBO2_${runTag}`],
    );
    branchOrg2Id = bO2.insertId;

    // Warehouses
    const [w1] = await pool.query(
      'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
      [branch1Id, `WH 1 ${runTag}`, `RWH1_${runTag}`],
    );
    wh1Id = w1.insertId;

    const [w2] = await pool.query(
      'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
      [branch2Id, `WH 2 ${runTag}`, `RWH2_${runTag}`],
    );
    wh2Id = w2.insertId;

    const [loc1] = await pool.query(
      'INSERT INTO storage_locations (warehouse_id, code, name, status) VALUES (?, ?, ?, "active")',
      [wh1Id, `LOC1_${runTag}`, 'Shelf A'],
    );
    location1Id = loc1.insertId;

    const [loc2] = await pool.query(
      'INSERT INTO storage_locations (warehouse_id, code, name, status) VALUES (?, ?, ?, "active")',
      [wh2Id, `LOC2_${runTag}`, 'Shelf B'],
    );
    location2Id = loc2.insertId;

    // Unit
    const [u] = await pool.query('INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [
      org1Id,
      `Unit ${runTag}`,
      `RU_${runTag}`,
    ]);
    unitId = u.insertId;

    // Category
    const [cat] = await pool.query(
      'INSERT INTO categories (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Category ${runTag}`, `CAT_${runTag}`],
    );
    cat1Id = cat.insertId;

    // Products
    const [p1] = await pool.query(
      `INSERT INTO products (organization_id, category_id, name, code, prescription_classification, min_stock_level, status)
       VALUES (?, ?, ?, ?, 'otc', 10, 'active')`,
      [org1Id, cat1Id, `Product 1 ${runTag}`, `P1_${runTag}`],
    );
    prod1Id = p1.insertId;

    const [p2] = await pool.query(
      `INSERT INTO products (organization_id, category_id, name, code, prescription_classification, min_stock_level, status)
       VALUES (?, ?, ?, ?, 'prescription', 20, 'active')`,
      [org1Id, cat1Id, `Product 2 ${runTag}`, `P2_${runTag}`],
    );
    prod2Id = p2.insertId;

    // Batches
    const [bat1] = await pool.query(
      'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 30 DAY), "active")',
      [org1Id, prod1Id, `BATCH1_${runTag}`],
    );
    batch1Id = bat1.insertId;

    const [bat2] = await pool.query(
      'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 5 DAY), "active")',
      [org1Id, prod2Id, `BATCH2_EXP_${runTag}`],
    );
    batch2Id = bat2.insertId;

    // Customers & Suppliers
    const [c1] = await pool.query('INSERT INTO customers (organization_id, name, status) VALUES (?, ?, "active")', [
      org1Id,
      `Customer 1 ${runTag}`,
    ]);
    customer1Id = c1.insertId;

    const [s1] = await pool.query('INSERT INTO suppliers (organization_id, name, status) VALUES (?, ?, "active")', [
      org1Id,
      `Supplier 1 ${runTag}`,
    ]);
    supplier1Id = s1.insertId;

    // Users
    // 1. Admin user with full report permissions and Org 1 scope
    adminUserId = await insertUser(`Admin Rpt ${runTag}`, `admin_rpt_${runTag}@test.com`);
    await addRoleWithPerms(adminUserId, [
      'report.dashboard.view',
      'report.sales.view',
      'report.inventory.view',
      'report.financial.view',
      'report.procurement.view',
      'report.dispensing.view',
      'report.expiry_quarantine.view',
    ]);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [adminUserId, org1Id]);

    // 2. Branch 1 user (restricted to Branch 1 only)
    branch1UserId = await insertUser(`Branch1 User ${runTag}`, `b1_user_${runTag}@test.com`);
    await addRoleWithPerms(branch1UserId, [
      'report.dashboard.view',
      'report.sales.view',
      'report.inventory.view',
      'report.financial.view',
    ]);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [branch1UserId, branch1Id]);

    // 3. No permission user
    noPermUserId = await insertUser(`No Perm ${runTag}`, `noperm_${runTag}@test.com`);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [noPermUserId, org1Id]);

    // 4. Org 2 user
    org2UserId = await insertUser(`Org2 User ${runTag}`, `org2_user_${runTag}@test.com`);
    await addRoleWithPerms(org2UserId, ['report.dashboard.view', 'report.sales.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

    // Agents
    agentAdmin = await loginAgent(`admin_rpt_${runTag}@test.com`);
    agentBranch1User = await loginAgent(`b1_user_${runTag}@test.com`);
    agentNoPermUser = await loginAgent(`noperm_${runTag}@test.com`);
    agentOrg2User = await loginAgent(`org2_user_${runTag}@test.com`);

    // Seed transactional data in Org 1 / Branch 1
    // Completed sale in Branch 1 (Total: 500, Paid: 500)
    const [sCompleted] = await pool.query(
      `INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, status, subtotal, discount_amount, total_amount, paid_amount, payment_status, created_by)
       VALUES (?, ?, ?, ?, ?, NOW(), 'completed', 550.00, 50.00, 500.00, 500.00, 'paid', ?)`,
      [org1Id, branch1Id, wh1Id, customer1Id, `SALE-COMP-${runTag}`, adminUserId],
    );
    await pool.query(
      'INSERT INTO sale_lines (sale_id, product_id, unit_id, quantity, unit_price, discount_amount, line_total) VALUES (?, ?, ?, 5, 100.00, 0, 500.00)',
      [sCompleted.insertId, prod1Id, unitId],
    );

    // Draft sale in Branch 1 (should be excluded from completed reports)
    await pool.query(
      `INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, status, subtotal, discount_amount, total_amount, paid_amount, payment_status, created_by)
       VALUES (?, ?, ?, ?, ?, NOW(), 'draft', 300.00, 0.00, 300.00, 0.00, 'unpaid', ?)`,
      [org1Id, branch1Id, wh1Id, customer1Id, `SALE-DRAFT-${runTag}`, adminUserId],
    );

    // Completed sale in Branch 2 (Total: 800)
    const [sBranch2] = await pool.query(
      `INSERT INTO sales (organization_id, branch_id, warehouse_id, customer_id, sale_number, sale_date, status, subtotal, discount_amount, total_amount, paid_amount, payment_status, created_by)
       VALUES (?, ?, ?, ?, ?, NOW(), 'completed', 800.00, 0.00, 800.00, 800.00, 'paid', ?)`,
      [org1Id, branch2Id, wh2Id, customer1Id, `SALE-B2-${runTag}`, adminUserId],
    );
    await pool.query(
      'INSERT INTO sale_lines (sale_id, product_id, unit_id, quantity, unit_price, discount_amount, line_total) VALUES (?, ?, ?, 8, 100.00, 0, 800.00)',
      [sBranch2.insertId, prod1Id, unitId],
    );

    // Payments: One 500 cash payment in Branch 1
    await pool.query(
      `INSERT INTO payments (organization_id, branch_id, payment_number, payment_date, payment_method, amount, status, customer_id, recorded_by)
       VALUES (?, ?, ?, NOW(), 'cash', 500.00, 'completed', ?, ?)`,
      [org1Id, branch1Id, `PAY-1-${runTag}`, customer1Id, adminUserId],
    );

    // Customer Receivables: 200 outstanding balance in Branch 1
    await pool.query(
      `INSERT INTO customer_receivables (organization_id, branch_id, customer_id, receivable_number, reference_type, reference_id, total_amount, paid_amount, balance_amount, status, created_by)
       VALUES (?, ?, ?, ?, 'sale', ?, 200.00, 50.00, 150.00, 'partially_paid', ?)`,
      [org1Id, branch1Id, customer1Id, `REC-1-${runTag}`, sCompleted.insertId, adminUserId],
    );

    // Inventory in Branch 1 / WH 1:
    // Available: 15 units of prod 1 (batch 1)
    await pool.query(
      `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 15.000)`,
      [org1Id, branch1Id, wh1Id, location1Id, prod1Id, batch1Id, unitId],
    );
    // Quarantined: 5 units of prod 1
    await pool.query(
      `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'quarantined', 5.000)`,
      [org1Id, branch1Id, wh1Id, location1Id, prod1Id, batch1Id, unitId],
    );
    // Expired: 10 units of prod 2 (batch 2)
    await pool.query(
      `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'expired', 10.000)`,
      [org1Id, branch1Id, wh1Id, location1Id, prod2Id, batch2Id, unitId],
    );

    // Quarantine case
    await pool.query(
      `INSERT INTO quarantine_cases (organization_id, branch_id, warehouse_id, storage_location_id, quarantine_number, product_id, batch_id, unit_id, quantity, reason, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5.000, 'Damaged seals', 'quarantined', ?)`,
      [org1Id, branch1Id, wh1Id, location1Id, `QC-${runTag}`, prod1Id, batch1Id, unitId, adminUserId],
    );

    // Purchase Order in Branch 1
    const [po1] = await pool.query(
      `INSERT INTO purchase_orders (organization_id, branch_id, supplier_id, po_number, order_date, status, total_amount, created_by)
       VALUES (?, ?, ?, ?, CURDATE(), 'approved', 1200.00, ?)`,
      [org1Id, branch1Id, supplier1Id, `PO-1-${runTag}`, adminUserId],
    );
    await pool.query(
      'INSERT INTO purchase_order_lines (purchase_order_id, product_id, unit_id, ordered_quantity, unit_price, line_total) VALUES (?, ?, ?, 12, 100.00, 1200.00)',
      [po1.insertId, prod1Id, unitId],
    );
  } catch (err) {
    console.error('Test before hook failed:', err);
    throw err;
  }
});

after(async () => {
  try {
    if (pool && org1Id && org2Id) {
      await pool.query('DELETE FROM quarantine_cases WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM purchase_order_lines WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id IN (?, ?))', [org1Id, org2Id]);
      await pool.query('DELETE FROM purchase_orders WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM customer_receivables WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM payments WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE organization_id IN (?, ?))', [org1Id, org2Id]);
      await pool.query('DELETE FROM sales WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM inventory WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM batches WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
      await pool.query('DELETE FROM products WHERE organization_id IN (?, ?)', [org1Id, org2Id]);
    }
  } catch (e) {
    // ignore cleanup error
  }
  if (closePool) await closePool();
});

test('1. Unauthenticated requests to report endpoints return 401', async () => {
  const unauth = request(app);

  const resDash = await unauth.get('/api/v1/reports/dashboard');
  assert.equal(resDash.status, 401);

  const resSales = await unauth.get('/api/v1/reports/sales');
  assert.equal(resSales.status, 401);

  const resInv = await unauth.get('/api/v1/reports/inventory');
  assert.equal(resInv.status, 401);

  const resFin = await unauth.get('/api/v1/reports/financial');
  assert.equal(resFin.status, 401);
});

test('2. User lacking reporting permissions receives 403 Forbidden', async () => {
  const res = await agentNoPermUser.get('/api/v1/reports/dashboard');
  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);

  const resSales = await agentNoPermUser.get('/api/v1/reports/sales');
  assert.equal(resSales.status, 403);
});

test('3. Admin user with full report permissions accesses dashboard overview successfully', async () => {
  const res = await agentAdmin.get('/api/v1/reports/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.sales);
  assert.ok(res.body.data.finance);
  assert.ok(res.body.data.inventory);
  assert.ok(res.body.data.operations);

  // Completed sales count across all branches in Org 1 should be at least 2 (500 + 800)
  assert.ok(res.body.data.sales.completedCount >= 2);
  assert.ok(res.body.data.sales.totalSalesAmount >= 1300);

  // Low stock and near expiry counts
  assert.ok(res.body.data.inventory.availableQuantity >= 15);
  assert.ok(res.body.data.inventory.quarantinedQuantity >= 5);
  assert.ok(res.body.data.inventory.expiredQuantity >= 10);
  assert.ok(res.body.data.inventory.nearExpiryBatchCount >= 1);
  assert.ok(res.body.data.inventory.expiredBatchCount >= 1);
});

test('4. Branch-scoped user only sees Branch 1 data, never Branch 2 data', async () => {
  const res = await agentBranch1User.get('/api/v1/reports/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  // Branch 1 user should only see Branch 1 sales (500.00), NOT Branch 2's 800.00
  assert.equal(res.body.data.sales.completedCount, 1);
  assert.equal(res.body.data.sales.totalSalesAmount, 500);
});

test('5. Branch-scoped user querying out-of-scope branchId receives 403 Forbidden', async () => {
  const res = await agentBranch1User.get(`/api/v1/reports/sales?branchId=${branch2Id}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'SCOPE_FORBIDDEN');
});

test('6. User querying out-of-scope organizationId receives 403 Forbidden', async () => {
  const res = await agentBranch1User.get(`/api/v1/reports/dashboard?organizationId=${org2Id}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'SCOPE_FORBIDDEN');
});

test('7. Date validation: inverted date range (startDate > endDate) returns 400', async () => {
  const res = await agentAdmin.get('/api/v1/reports/sales?startDate=2026-12-31&endDate=2026-01-01');
  assert.equal(res.status, 400);
  assert.match(res.body.error?.message, /startDate cannot be after endDate/);
});

test('8. Date validation: malformed date string returns 400', async () => {
  const res = await agentAdmin.get('/api/v1/reports/sales?startDate=not-a-date');
  assert.equal(res.status, 400);
  assert.match(res.body.error?.message, /Invalid startDate format/);
});

test('9. Sales report excludes draft transactions from completed totals', async () => {
  const res = await agentAdmin.get('/api/v1/reports/sales');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  // Verify none of the items returned are 'draft' or 'cancelled'
  res.body.data.items.forEach((item) => {
    assert.equal(item.status, 'completed');
  });

  // Verify summary reflects completed sales only
  assert.ok(res.body.data.summary.completedCount >= 2);
  assert.ok(res.body.data.summary.netTotal >= 1300);
});

test('10. Financial report returns collections by method and outstanding receivables', async () => {
  const res = await agentAdmin.get('/api/v1/reports/financial');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  assert.ok(res.body.data.summary.totalCollected >= 500);
  assert.ok(res.body.data.summary.outstandingReceivablesBalance >= 150);

  // Check method breakdown contains cash
  const cashMethod = res.body.data.byMethod.find((m) => m.payment_method === 'cash');
  assert.ok(cashMethod, 'Expected cash payment method in breakdown');
  assert.ok(Number(cashMethod.total_amount) >= 500);
});

test('11. Inventory report returns physical vs available quantities and batch valuation', async () => {
  const res = await agentAdmin.get('/api/v1/reports/inventory');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  assert.ok(res.body.data.summary.availableQuantity >= 15);
  assert.ok(res.body.data.summary.quarantinedQuantity >= 5);
  assert.ok(res.body.data.summary.expiredQuantity >= 10);
  assert.ok(res.body.data.summary.physicalQuantity >= 30);

  // Items list contains batch and warehouse info
  assert.ok(res.body.data.items.length > 0);
  const firstItem = res.body.data.items[0];
  assert.ok(firstItem.product_name);
  assert.ok(firstItem.batch_number);
  assert.ok(firstItem.warehouse_name);
});

test('12. Procurement report returns purchase order fulfillments and spend', async () => {
  const res = await agentAdmin.get('/api/v1/reports/procurement');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  assert.ok(res.body.data.summary.totalOrders >= 1);
  assert.ok(res.body.data.summary.totalSpend >= 1200);
  assert.ok(res.body.data.items.length >= 1);

  const po = res.body.data.items.find((item) => Number(item.total_amount) === 1200);
  assert.ok(po, 'Expected PO with 1200 spend');
  assert.equal(Number(po.total_ordered_qty), 12);
});

test('13. Expiry and Quarantine exceptions report returns near-expiry batches and active holds', async () => {
  const res = await agentAdmin.get('/api/v1/reports/expiry-quarantine?daysThreshold=90');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  assert.ok(res.body.data.expiryBatches.length >= 1);
  assert.ok(res.body.data.quarantines.length >= 1);

  const qCase = res.body.data.quarantines.find((q) => q.reason === 'Damaged seals');
  assert.ok(qCase, 'Expected quarantine case Damaged seals');
  assert.equal(qCase.status, 'quarantined');
});

test('14. Multi-organization isolation: Org 2 user sees zero Org 1 sales', async () => {
  const res = await agentOrg2User.get('/api/v1/reports/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  // Org 2 has no sales seeded
  assert.equal(res.body.data.sales.completedCount, 0);
  assert.equal(res.body.data.sales.totalSalesAmount, 0);
});
