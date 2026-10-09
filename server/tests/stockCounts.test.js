/**
 * Task 16 — Stock Counting and Stock Adjustments Integration Tests
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

const PASSWORD = 'Passw0rd!stockcount';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id, branchOrg2Id;
let wh1Id, wh2Id, whOrg2Id;
let loc1Id, loc2Id;
let unitId;
let product1Id, product2Id;
let batch1Id, batch2Id;

let agentAdmin;
let agentClerk;
let agentOtherBranch;
let agentOrg2;
let adminUserId;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLSC_' + Math.random().toString(36).slice(2, 9);
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
  const { runMigrations } = await import('../src/database/migrate.js');
  await runMigrations();

  const poolMod = await import('../src/database/pool.js');
  pool = poolMod.getPool();
  closePool = poolMod.closePool;
  app = (await import('../src/app.js')).default;

  const runTag = Math.random().toString(36).slice(2, 8);

  // Clean test stock count data
  await pool.query('DELETE FROM stock_count_line_events');
  await pool.query('DELETE FROM stock_count_lines');
  await pool.query('DELETE FROM stock_counts');

  // Org 1 (Main Org)
  const [o1] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Count Org 1 ${runTag}`, `CO1_${runTag}`],
  );
  org1Id = o1.insertId;

  // Org 2 (Isolated Org)
  const [o2] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Count Org 2 ${runTag}`, `CO2_${runTag}`],
  );
  org2Id = o2.insertId;

  // Branches in Org 1
  const [b1] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Count Branch 1 ${runTag}`, `CBR1_${runTag}`],
  );
  branch1Id = b1.insertId;

  const [b2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Count Branch 2 ${runTag}`, `CBR2_${runTag}`],
  );
  branch2Id = b2.insertId;

  // Branch in Org 2
  const [bOrg2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org2Id, `Org2 Branch ${runTag}`, `CBO2_${runTag}`],
  );
  branchOrg2Id = bOrg2.insertId;

  // Warehouses
  const [w1] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branch1Id, `Main Warehouse ${runTag}`, `CWH1_${runTag}`],
  );
  wh1Id = w1.insertId;

  const [w2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branch2Id, `Second Warehouse ${runTag}`, `CWH2_${runTag}`],
  );
  wh2Id = w2.insertId;

  const [wOrg2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branchOrg2Id, `Org2 Warehouse ${runTag}`, `CWHO2_${runTag}`],
  );
  whOrg2Id = wOrg2.insertId;

  // Storage Locations
  const [l1] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, ?, ?, "active")',
    [wh1Id, `Storage Loc A ${runTag}`, `LOCA_${runTag}`],
  );
  loc1Id = l1.insertId;

  const [l2] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, ?, ?, "active")',
    [wh1Id, `Storage Loc B ${runTag}`, `LOCB_${runTag}`],
  );
  loc2Id = l2.insertId;

  // Unit
  const [u] = await pool.query(
    'INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Count Unit ${runTag}`, `CUNT_${runTag}`],
  );
  unitId = u.insertId;

  // Products in Org 1
  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Amoxicillin 500mg', ?, 15.00, 'otc', 'active')`,
    [org1Id, `CPRD1_${runTag}`],
  );
  product1Id = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product1Id, unitId]);

  const [p2] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Paracetamol 500mg', ?, 10.00, 'otc', 'active')`,
    [org1Id, `CPRD2_${runTag}`],
  );
  product2Id = p2.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product2Id, unitId]);

  // Batches
  const [bch1] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, "2028-12-31", "active")',
    [org1Id, product1Id, `BTCH1_${runTag}`],
  );
  batch1Id = bch1.insertId;

  const [bch2] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, "2029-06-30", "active")',
    [org1Id, product2Id, `BTCH2_${runTag}`],
  );
  batch2Id = bch2.insertId;

  // Initial Inventory
  // Product 1: 100 units at loc1Id
  await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 100)`,
    [org1Id, branch1Id, wh1Id, loc1Id, product1Id, batch1Id, unitId],
  );

  // Product 2: 50 units at loc2Id
  await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 50)`,
    [org1Id, branch1Id, wh1Id, loc2Id, product2Id, batch2Id, unitId],
  );

  // Users
  adminUserId = await insertUser(`Count Admin ${runTag}`, `admin_sc_${runTag}@test.com`);
  const clerkUserId = await insertUser(`Count Clerk ${runTag}`, `clerk_sc_${runTag}@test.com`);
  const otherBranchUserId = await insertUser(`Other Branch User ${runTag}`, `other_sc_${runTag}@test.com`);
  const org2UserId = await insertUser(`Org2 Count User ${runTag}`, `org2_sc_${runTag}@test.com`);

  // Permissions
  const allCountPerms = [
    'stock_count.view',
    'stock_count.create',
    'stock_count.record',
    'stock_count.submit',
    'stock_count.approve',
    'stock_count.reject',
    'stock_count.apply_adjustment',
    'stock_count.cancel',
  ];

  await addRoleWithPerms(adminUserId, allCountPerms);
  await addRoleWithPerms(clerkUserId, allCountPerms);
  await addRoleWithPerms(otherBranchUserId, allCountPerms);
  await addRoleWithPerms(org2UserId, allCountPerms);

  // Scopes
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [adminUserId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [clerkUserId, branch1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, warehouse_id) VALUES (?, "warehouse", ?)', [clerkUserId, wh1Id]);

  // Other branch user scoped ONLY to branch2 / wh2
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [otherBranchUserId, branch2Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, warehouse_id) VALUES (?, "warehouse", ?)', [otherBranchUserId, wh2Id]);

  // Org 2 user scoped to Org 2
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

  // Logins
  agentAdmin = await loginAgent(`admin_sc_${runTag}@test.com`);
  agentClerk = await loginAgent(`clerk_sc_${runTag}@test.com`);
  agentOtherBranch = await loginAgent(`other_sc_${runTag}@test.com`);
  agentOrg2 = await loginAgent(`org2_sc_${runTag}@test.com`);
});

test('STOCK COUNT: Scope enforcement prevents out-of-scope users from creating count sessions', async () => {
  // Clerk from branch 2 attempts to create count in branch 1 / wh 1
  const res = await agentOtherBranch.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

test('STOCK COUNT: Draft creation, Start, and Inventory Snapshot generation', async () => {
  // Admin creates draft session
  const resCreate = await agentAdmin.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
    notes: 'Quarterly full warehouse count',
  });
  assert.equal(resCreate.status, 201);
  assert.equal(resCreate.body.data.status, 'draft');
  assert.match(resCreate.body.data.count_number, /^SC-\d{8}-\d{4}$/);

  const countId = resCreate.body.data.id;

  // Start the session to take snapshot
  const resStart = await agentAdmin.post(`/api/v1/stock-counts/${countId}/start`);
  assert.equal(resStart.status, 200);
  assert.equal(resStart.body.data.status, 'in_progress');
  assert.equal(resStart.body.data.lines.length, 2);

  // Validate snapshot line quantities
  const lineP1 = resStart.body.data.lines.find((l) => l.product_id === product1Id);
  const lineP2 = resStart.body.data.lines.find((l) => l.product_id === product2Id);

  assert.equal(Number(lineP1.system_quantity), 100);
  assert.equal(lineP1.counted_quantity, null);
  assert.equal(lineP1.is_counted, 0);

  assert.equal(Number(lineP2.system_quantity), 50);
  assert.equal(lineP2.counted_quantity, null);
  assert.equal(lineP2.is_counted, 0);
});

test('STOCK COUNT: Physical count recording, explicit zero vs uncounted, and variance calculation', async () => {
  // Create and start count
  const resCreate = await agentAdmin.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
  });
  const countId = resCreate.body.data.id;
  await agentAdmin.post(`/api/v1/stock-counts/${countId}/start`);

  const countData = (await agentAdmin.get(`/api/v1/stock-counts/${countId}`)).body.data;
  const lineP1 = countData.lines.find((l) => l.product_id === product1Id);
  const lineP2 = countData.lines.find((l) => l.product_id === product2Id);

  // Attempt recording non-zero variance without reason (must fail)
  const resNoReason = await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [
      {
        lineId: lineP1.id,
        countedQuantity: 95,
      },
    ],
  });
  assert.equal(resNoReason.status, 400);

  // Record valid physical counts:
  // Line 1: count 95 (shortage of 5). Variance = -5
  // Line 2: explicit zero count (count 0, was 50). Variance = -50
  const resRecord = await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [
      {
        lineId: lineP1.id,
        countedQuantity: 95,
        varianceReason: 'Physical count discrepancy - damaged units removed earlier',
      },
      {
        lineId: lineP2.id,
        countedQuantity: 0,
        varianceReason: 'Batch completely depleted or misplaced',
      },
    ],
  });
  assert.equal(resRecord.status, 200);

  const updatedLine1 = resRecord.body.data.lines.find((l) => l.id === lineP1.id);
  const updatedLine2 = resRecord.body.data.lines.find((l) => l.id === lineP2.id);

  assert.equal(Number(updatedLine1.counted_quantity), 95);
  assert.equal(updatedLine1.is_counted, 1);
  assert.equal(Number(updatedLine1.variance_quantity), -5);

  assert.equal(Number(updatedLine2.counted_quantity), 0);
  assert.equal(updatedLine2.is_counted, 1);
  assert.equal(Number(updatedLine2.variance_quantity), -50);

  // Verify events audit trail
  assert.equal(resRecord.body.data.events.length, 2);
  assert.equal(resRecord.body.data.events[0].event_type, 'initial_count');
});

test('STOCK COUNT: Recount workflow flags line and logs audit history', async () => {
  const resCreate = await agentAdmin.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
  });
  const countId = resCreate.body.data.id;
  await agentAdmin.post(`/api/v1/stock-counts/${countId}/start`);

  const countData = (await agentAdmin.get(`/api/v1/stock-counts/${countId}`)).body.data;
  const lineP1 = countData.lines[0];

  // Record count
  await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [
      {
        lineId: lineP1.id,
        countedQuantity: 90,
        varianceReason: 'Apparent shortage',
      },
    ],
  });

  // Request recount
  const resRecount = await agentAdmin.post(`/api/v1/stock-counts/${countId}/recount`).send({
    lineIds: [lineP1.id],
    recountNotes: 'Please verify top shelf for remaining boxes',
  });
  assert.equal(resRecount.status, 200);

  const recountedLine = resRecount.body.data.lines.find((l) => l.id === lineP1.id);
  assert.equal(recountedLine.recount_requested, 1);

  // Correct count after physical verification to 98
  const resCorrect = await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [
      {
        lineId: lineP1.id,
        countedQuantity: 98,
        varianceReason: 'Found 8 additional boxes in top shelf',
      },
    ],
  });
  assert.equal(resCorrect.status, 200);
  const correctedLine = resCorrect.body.data.lines.find((l) => l.id === lineP1.id);
  assert.equal(Number(correctedLine.counted_quantity), 98);
  assert.equal(Number(correctedLine.variance_quantity), -2);
  assert.equal(correctedLine.recount_requested, 0);
});

test('STOCK COUNT: End-to-end Lifecycle (Submit -> Approve -> Apply Stock Adjustments) and Ledger verification', async () => {
  // Set known starting inventory
  await pool.query(
    'UPDATE inventory SET quantity = 100 WHERE product_id = ? AND warehouse_id = ?',
    [product1Id, wh1Id],
  );

  const resCreate = await agentAdmin.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
    notes: 'End-to-end adjustment test',
  });
  const countId = resCreate.body.data.id;
  await agentAdmin.post(`/api/v1/stock-counts/${countId}/start`);

  const countData = (await agentAdmin.get(`/api/v1/stock-counts/${countId}`)).body.data;
  const lineP1 = countData.lines.find((l) => l.product_id === product1Id);
  const lineP2 = countData.lines.find((l) => l.product_id === product2Id);

  // Record:
  // Product 1: counted 95 (shortage of 5: variance -5)
  // Product 2: counted 60 (surplus of 10: variance +10)
  await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [
      {
        lineId: lineP1.id,
        countedQuantity: 95,
        varianceReason: 'Physical shortage observed',
      },
      {
        lineId: lineP2.id,
        countedQuantity: 60,
        varianceReason: 'Found untracked surplus box',
      },
    ],
  });

  // Submit
  const resSubmit = await agentClerk.post(`/api/v1/stock-counts/${countId}/submit`);
  assert.equal(resSubmit.status, 200);
  assert.equal(resSubmit.body.data.status, 'submitted');

  // Verify cannot record counts while submitted
  const resRecordBlocked = await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [{ lineId: lineP1.id, countedQuantity: 96, varianceReason: 'Late edit' }],
  });
  assert.equal(resRecordBlocked.status, 409);

  // Approve
  const resApprove = await agentAdmin.post(`/api/v1/stock-counts/${countId}/approve`).send({
    approvalNotes: 'Variances reviewed and approved for ledger adjustment',
  });
  assert.equal(resApprove.status, 200);
  assert.equal(resApprove.body.data.status, 'approved');

  // Apply adjustments
  const resApply = await agentAdmin.post(`/api/v1/stock-counts/${countId}/apply`);
  assert.equal(resApply.status, 200);
  assert.equal(resApply.body.data.status, 'completed');

  // Verify Inventory balances in database
  const [inv1Rows] = await pool.query('SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ?', [product1Id, wh1Id]);
  const [inv2Rows] = await pool.query('SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ?', [product2Id, wh1Id]);

  assert.equal(Number(inv1Rows[0].quantity), 95, 'Product 1 balance must be adjusted to 95');
  assert.equal(Number(inv2Rows[0].quantity), 60, 'Product 2 balance must be adjusted to 60');

  // Verify Stock Movements ledger entries
  const [movRows] = await pool.query(
    'SELECT movement_type, quantity_delta, reference_type, reference_id FROM stock_movements WHERE reference_type = "stock_count" AND reference_id = ? ORDER BY id ASC',
    [countId],
  );
  assert.equal(movRows.length, 2);
  assert.equal(movRows[0].movement_type, 'adjustment');
  assert.equal(Number(movRows[0].quantity_delta), -5);
  assert.equal(movRows[1].movement_type, 'adjustment');
  assert.equal(Number(movRows[1].quantity_delta), 10);

  // Verify completed session cannot be cancelled or re-applied
  const resCancel = await agentAdmin.post(`/api/v1/stock-counts/${countId}/cancel`);
  assert.equal(resCancel.status, 409);

  const resReapply = await agentAdmin.post(`/api/v1/stock-counts/${countId}/apply`);
  assert.equal(resReapply.status, 409);
});

test('STOCK COUNT: Negative inventory protection and concurrency safety', async () => {
  // Set current inventory to 10
  await pool.query(
    'UPDATE inventory SET quantity = 10 WHERE product_id = ? AND warehouse_id = ?',
    [product1Id, wh1Id],
  );

  const resCreate = await agentAdmin.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
  });
  const countId = resCreate.body.data.id;
  await agentAdmin.post(`/api/v1/stock-counts/${countId}/start`);

  const countData = (await agentAdmin.get(`/api/v1/stock-counts/${countId}`)).body.data;
  const lineP1 = countData.lines.find((l) => l.product_id === product1Id);

  // Count observed 0 (shortage of 10)
  await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [
      {
        lineId: lineP1.id,
        countedQuantity: 0,
        varianceReason: 'Stock lost',
      },
    ],
  });

  await agentClerk.post(`/api/v1/stock-counts/${countId}/submit`);
  await agentAdmin.post(`/api/v1/stock-counts/${countId}/approve`);

  // Intervening movement: another sale depleted inventory from 10 down to 2
  await pool.query(
    'UPDATE inventory SET quantity = 2 WHERE product_id = ? AND warehouse_id = ?',
    [product1Id, wh1Id],
  );

  // Applying negative adjustment of -10 when balance is only 2 must be rejected
  const resApplyFail = await agentAdmin.post(`/api/v1/stock-counts/${countId}/apply`);
  assert.equal(resApplyFail.status, 409);
  assert.equal(resApplyFail.body.error.code, 'INSUFFICIENT_STOCK');

  // Verify balance remained 2 (no partial corruption)
  const [invRows] = await pool.query('SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ?', [product1Id, wh1Id]);
  assert.equal(Number(invRows[0].quantity), 2);
});

test('STOCK COUNT: Rejection flow with required reason', async () => {
  const resCreate = await agentAdmin.post('/api/v1/stock-counts').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    countType: 'full',
  });
  const countId = resCreate.body.data.id;
  await agentAdmin.post(`/api/v1/stock-counts/${countId}/start`);

  const countData = (await agentAdmin.get(`/api/v1/stock-counts/${countId}`)).body.data;
  const lineP1 = countData.lines[0];

  await agentClerk.post(`/api/v1/stock-counts/${countId}/record-count`).send({
    lines: [{ lineId: lineP1.id, countedQuantity: 10, varianceReason: 'Test' }],
  });

  await agentClerk.post(`/api/v1/stock-counts/${countId}/submit`);

  // Reject without reason fails
  const resNoReason = await agentAdmin.post(`/api/v1/stock-counts/${countId}/reject`).send({});
  assert.equal(resNoReason.status, 400);

  // Reject with reason succeeds
  const resReject = await agentAdmin.post(`/api/v1/stock-counts/${countId}/reject`).send({
    rejectionReason: 'Counting procedure was not followed correctly; please restart session.',
  });
  assert.equal(resReject.status, 200);
  assert.equal(resReject.body.data.status, 'rejected');
});

test('STOCK COUNT: Cross-organization data isolation', async () => {
  const resList = await agentOrg2.get('/api/v1/stock-counts');
  assert.equal(resList.status, 200);
  // Org 2 user should see 0 counts from Org 1
  assert.equal(resList.body.data.items.length, 0);
});

after(async () => {
  if (pool) {
    try {
      await pool.query('DELETE FROM stock_count_line_events');
      await pool.query('DELETE FROM stock_count_lines');
      await pool.query('DELETE FROM stock_counts');
      if (org1Id && org2Id) {
        await pool.query('DELETE FROM organizations WHERE id IN (?, ?)', [org1Id, org2Id]);
      }
    } catch (e) {
      // Ignore cleanup error
    }
  }
  if (closePool) {
    await closePool();
  }
});
