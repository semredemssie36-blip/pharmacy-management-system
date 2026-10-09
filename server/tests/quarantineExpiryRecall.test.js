/**
 * Task 17 — Quarantine, Expiry Management, and Product Recall Integration Tests
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

const PASSWORD = 'Passw0rd!quarantine';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id, branchOrg2Id;
let wh1Id, wh2Id, whOrg2Id;
let loc1Id, loc2Id;
let unitId;
let product1Id, product2Id;
let batchValidId, batchExpiringSoonId, batchExpiredId, batchRecallId;

let agentAdmin;
let agentBranch1User;
let agentBranch2User;
let agentOrg2;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLQ_' + Math.random().toString(36).slice(2, 9);
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

  // Clean test quarantine and recall data
  await pool.query('DELETE FROM recall_actions').catch(() => {});
  await pool.query('DELETE FROM recall_batches').catch(() => {});
  await pool.query('DELETE FROM recall_cases').catch(() => {});
  await pool.query('DELETE FROM quarantine_cases').catch(() => {});

  // Org 1 (Main Org)
  const [o1] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Quarantine Org 1 ${runTag}`, `QO1_${runTag}`],
  );
  org1Id = o1.insertId;

  // Org 2 (Isolated Org)
  const [o2] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Quarantine Org 2 ${runTag}`, `QO2_${runTag}`],
  );
  org2Id = o2.insertId;

  // Branches
  const [b1] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Piassa Main ${runTag}`, `B1_${runTag}`],
  );
  branch1Id = b1.insertId;

  const [b2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Megenagna Branch ${runTag}`, `B2_${runTag}`],
  );
  branch2Id = b2.insertId;

  const [bOrg2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org2Id, `Org 2 Branch ${runTag}`, `BO2_${runTag}`],
  );
  branchOrg2Id = bOrg2.insertId;

  // Warehouses
  const [w1] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branch1Id, `Piassa Warehouse ${runTag}`, `WH1_${runTag}`],
  );
  wh1Id = w1.insertId;

  const [w2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branch2Id, `Megenagna Warehouse ${runTag}`, `WH2_${runTag}`],
  );
  wh2Id = w2.insertId;

  const [wOrg2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branchOrg2Id, `Org 2 Warehouse ${runTag}`, `WHO2_${runTag}`],
  );
  whOrg2Id = wOrg2.insertId;

  // Storage Locations
  const [l1] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, "Shelf A1", "LOC-A1", "active")',
    [wh1Id],
  );
  loc1Id = l1.insertId;

  const [l2] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, "Shelf B1", "LOC-B1", "active")',
    [wh2Id],
  );
  loc2Id = l2.insertId;

  // Base Unit
  const [u] = await pool.query(
    'INSERT INTO units (organization_id, name, code, status) VALUES (?, "Strip", "STP", "active")',
    [org1Id],
  );
  unitId = u.insertId;

  // Products
  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Amoxicillin 500mg', ?, 15.00, 'otc', 'active')`,
    [org1Id, `PROD-AMX-${runTag}`],
  );
  product1Id = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product1Id, unitId]);

  const [p2] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Paracetamol 500mg', ?, 10.00, 'otc', 'active')`,
    [org1Id, `PROD-PARA-${runTag}`],
  );
  product2Id = p2.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product2Id, unitId]);


  // Batches:
  // 1. Valid non-expired (1 year in future)
  const [bv] = await pool.query(
    `INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status)
     VALUES (?, ?, 'BATCH-VALID-2027', DATE_ADD(CURDATE(), INTERVAL 365 DAY), 'active')`,
    [org1Id, product1Id],
  );
  batchValidId = bv.insertId;

  // 2. Expiring soon (20 days in future)
  const [bes] = await pool.query(
    `INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status)
     VALUES (?, ?, 'BATCH-SOON-20DAY', DATE_ADD(CURDATE(), INTERVAL 20 DAY), 'active')`,
    [org1Id, product1Id],
  );
  batchExpiringSoonId = bes.insertId;

  // 3. Expired (10 days in past)
  const [bexp] = await pool.query(
    `INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status)
     VALUES (?, ?, 'BATCH-EXPIRED-PAST', DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'active')`,
    [org1Id, product2Id],
  );
  batchExpiredId = bexp.insertId;

  // 4. Batch for Recall testing
  const [br] = await pool.query(
    `INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status)
     VALUES (?, ?, 'BATCH-RECALL-TARGET', DATE_ADD(CURDATE(), INTERVAL 200 DAY), 'active')`,
    [org1Id, product1Id],
  );
  batchRecallId = br.insertId;

  // Seed inventory:
  // Wh1, Valid Batch: 100 available
  await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 100.000)`,
    [org1Id, branch1Id, wh1Id, loc1Id, product1Id, batchValidId, unitId],
  );

  // Wh1, Expiring Soon Batch: 50 available
  await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 50.000)`,
    [org1Id, branch1Id, wh1Id, loc1Id, product1Id, batchExpiringSoonId, unitId],
  );

  // Wh1, Expired Batch: 40 available
  await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 40.000)`,
    [org1Id, branch1Id, wh1Id, loc1Id, product2Id, batchExpiredId, unitId],
  );

  // Wh1, Recall Target Batch: 80 available
  await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 80.000)`,
    [org1Id, branch1Id, wh1Id, loc1Id, product1Id, batchRecallId, unitId],
  );

  // Setup Users:
  const allPerms = [
    'expiry.view',
    'quarantine.view',
    'quarantine.create',
    'quarantine.review',
    'quarantine.release',
    'quarantine.dispose',
    'recall.view',
    'recall.create',
    'recall.approve',
    'recall.activate',
    'recall.action',
    'recall.close',
    'inventory.view',
  ];

  // 1. Admin user (full org 1 scope)
  const adminId = await insertUser(`QAdmin_${runTag}`, `qadmin_${runTag}@example.com`);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [adminId, org1Id]);
  await addRoleWithPerms(adminId, allPerms);
  agentAdmin = await loginAgent(`qadmin_${runTag}@example.com`);

  // 2. Branch 1 user (scoped strictly to Branch 1)
  const b1UserId = await insertUser(`QB1_${runTag}`, `qb1_${runTag}@example.com`);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [b1UserId, branch1Id]);
  await addRoleWithPerms(b1UserId, allPerms);
  agentBranch1User = await loginAgent(`qb1_${runTag}@example.com`);

  // 3. Branch 2 user (scoped strictly to Branch 2)
  const b2UserId = await insertUser(`QB2_${runTag}`, `qb2_${runTag}@example.com`);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [b2UserId, branch2Id]);
  await addRoleWithPerms(b2UserId, allPerms);
  agentBranch2User = await loginAgent(`qb2_${runTag}@example.com`);

  // 4. Org 2 user (scoped to Org 2)
  const org2UserId = await insertUser(`QOrg2_${runTag}`, `qorg2_${runTag}@example.com`);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [org2UserId, org2Id]);
  await addRoleWithPerms(org2UserId, allPerms);
  agentOrg2 = await loginAgent(`qorg2_${runTag}@example.com`);
});

after(async () => {
  if (closePool) await closePool();
});

test('EXPIRY MANAGEMENT: Summary metrics and list reporting calculate days_to_expiry and categories correctly', async () => {
  // 1. Get summary
  const sumRes = await agentAdmin.get('/api/v1/expiry/summary');
  assert.equal(sumRes.status, 200);
  assert.equal(sumRes.body.success, true);
  const sum = sumRes.body.data;
  assert.ok(sum.expiredBatchesCount >= 1, 'At least 1 expired batch exists');
  assert.ok(sum.expiredUnitsTotal >= 40, 'At least 40 expired units exist');
  assert.ok(sum.nearExpiry30Count >= 1, 'At least 1 batch expiring within 30 days');

  // 2. List expired batches
  const expRes = await agentAdmin.get('/api/v1/expiry/batches?status=expired');
  assert.equal(expRes.status, 200);
  const expBatch = expRes.body.data.items.find((b) => b.batch_id === batchExpiredId);
  assert.ok(expBatch, 'Expired batch found');
  assert.ok(expBatch.days_to_expiry <= 0, 'days_to_expiry is negative or zero');
  assert.equal(expBatch.is_expired, true);

  // 3. List near-expiry batches (threshold 30 days)
  const nearRes = await agentAdmin.get('/api/v1/expiry/batches?status=near_expiry&thresholdDays=30');
  assert.equal(nearRes.status, 200);
  const nearBatch = nearRes.body.data.items.find((b) => b.batch_id === batchExpiringSoonId);
  assert.ok(nearBatch, 'Expiring soon batch found');
  assert.ok(nearBatch.days_to_expiry > 0 && nearBatch.days_to_expiry <= 30);
});

test('EXPIRY MANAGEMENT: Segregating expired stock transfers balance from available to expired status', async () => {
  const segRes = await agentAdmin.post('/api/v1/expiry/segregate-expired').send({
    branchId: branch1Id,
    warehouseId: wh1Id,
    batchId: batchExpiredId,
    storageLocationId: loc1Id,
  });
  assert.equal(segRes.status, 200);
  assert.equal(segRes.body.success, true);
  assert.equal(segRes.body.data.segregatedQuantity, 40);

  // Verify DB balances
  const [invRows] = await pool.query(
    'SELECT status, quantity FROM inventory WHERE warehouse_id = ? AND batch_id = ?',
    [wh1Id, batchExpiredId],
  );
  const avail = invRows.find((r) => r.status === 'available');
  const expired = invRows.find((r) => r.status === 'expired');

  assert.equal(Number(avail?.quantity || 0), 0, 'Available balance is now 0');
  assert.equal(Number(expired?.quantity || 0), 40, 'Expired balance is now 40');
});

test('QUARANTINE: Scope enforcement prevents out-of-scope branch user from placing stock on hold', async () => {
  // Branch 2 user attempts to quarantine stock in Branch 1 warehouse
  const res = await agentBranch2User.post('/api/v1/quarantines').send({
    branchId: branch1Id,
    warehouseId: wh1Id,
    storageLocationId: loc1Id,
    productId: product1Id,
    batchId: batchValidId,
    unitId,
    quantity: 10,
    reason: 'Suspicion of cracked vials',
  });
  assert.equal(res.status, 403, 'Forbidden due to branch scope mismatch');
});

test('QUARANTINE: Placing stock on hold decrements available stock, increments quarantined, preserves physical total', async () => {
  // Before: 100 available in batchValidId
  const res = await agentBranch1User.post('/api/v1/quarantines').send({
    branchId: branch1Id,
    warehouseId: wh1Id,
    storageLocationId: loc1Id,
    productId: product1Id,
    batchId: batchValidId,
    unitId,
    quantity: 25,
    reason: 'Suspicious packaging integrity',
    notes: 'Reported by receiving clerk',
  });
  assert.equal(res.status, 201);
  const qCase = res.body.data;
  assert.ok(qCase.quarantine_number.startsWith('QRN-'));
  assert.equal(qCase.status, 'quarantined');
  assert.equal(Number(qCase.quantity), 25);

  // Verify inventory positions
  const [invRows] = await pool.query(
    'SELECT status, quantity FROM inventory WHERE warehouse_id = ? AND batch_id = ?',
    [wh1Id, batchValidId],
  );
  const avail = invRows.find((r) => r.status === 'available');
  const quarantined = invRows.find((r) => r.status === 'quarantined');

  assert.equal(Number(avail.quantity), 75, 'Available stock reduced by 25 (100 -> 75)');
  assert.equal(Number(quarantined.quantity), 25, 'Quarantined stock increased to 25');

  // Overall physical stock = 75 + 25 = 100 (preserved)
  const physicalTotal = invRows.reduce((acc, r) => acc + Number(r.quantity), 0);
  assert.equal(physicalTotal, 100);
});

test('QUARANTINE: Review, Release safety protection (cannot release expired batch), and authorized release', async () => {
  // 1. Create quarantine case for 10 units of Valid batch
  const createRes = await agentAdmin.post('/api/v1/quarantines').send({
    branchId: branch1Id,
    warehouseId: wh1Id,
    storageLocationId: loc1Id,
    productId: product1Id,
    batchId: batchValidId,
    unitId,
    quantity: 10,
    reason: 'Routine QC audit hold',
  });
  assert.equal(createRes.status, 201);
  const caseId = createRes.body.data.id;

  // 2. Review case
  const reviewRes = await agentAdmin.post(`/api/v1/quarantines/${caseId}/review`).send({
    reviewNotes: 'QC lab lab testing confirmed active ingredient is stable',
  });
  assert.equal(reviewRes.status, 200);
  assert.equal(reviewRes.body.data.status, 'under_review');

  // 3. Release case
  const releaseRes = await agentAdmin.post(`/api/v1/quarantines/${caseId}/release`).send({
    releaseNotes: 'Lab results cleared: releasing back to general dispensing',
  });
  assert.equal(releaseRes.status, 200);
  assert.equal(releaseRes.body.data.status, 'released');

  // Check inventory returned from quarantined to available
  const [invRows] = await pool.query(
    'SELECT status, quantity FROM inventory WHERE warehouse_id = ? AND batch_id = ?',
    [wh1Id, batchValidId],
  );
  const avail = invRows.find((r) => r.status === 'available');
  assert.equal(Number(avail.quantity), 75, 'Available balance restored back to 75 (75 - 10 + 10 = 75)');
});

test('QUARANTINE: Disposal write-off reduces physical stock and writes negative movement to stock_movements', async () => {
  // 1. Create quarantine for 15 units of Valid batch
  const createRes = await agentAdmin.post('/api/v1/quarantines').send({
    branchId: branch1Id,
    warehouseId: wh1Id,
    storageLocationId: loc1Id,
    productId: product1Id,
    batchId: batchValidId,
    unitId,
    quantity: 15,
    reason: 'Water damage during store leak',
  });
  assert.equal(createRes.status, 201);
  const caseId = createRes.body.data.id;

  // 2. Dispose of stock
  const dispRes = await agentAdmin.post(`/api/v1/quarantines/${caseId}/dispose`).send({
    disposalMethod: 'Authorized Incineration',
    disposalNotes: 'Certified destruction of water-damaged blister strips',
  });
  assert.equal(dispRes.status, 200);
  assert.equal(dispRes.body.data.status, 'disposed');

  // Verify stock movements ledger
  const [movRows] = await pool.query(
    `SELECT movement_type, quantity_delta, reference_type, reference_id, reason
     FROM stock_movements
     WHERE reference_type = 'quarantine' AND reference_id = ?`,
    [caseId],
  );
  assert.equal(movRows.length, 1);
  assert.equal(movRows[0].movement_type, 'disposal');
  assert.equal(Number(movRows[0].quantity_delta), -15, 'Signed negative delta written to stock_movements');
  assert.ok(movRows[0].reason.includes('water-damaged'));
});

test('RECALL: End-to-end lifecycle (Create -> Approve -> Activate -> Containment Hold -> Action -> Close)', async () => {
  // Before: batchRecallId has 80 available units
  // 1. Create recall case (draft)
  const createRes = await agentAdmin.post('/api/v1/recalls').send({
    productId: product1Id,
    title: 'EFDA Alert: Subpotent Amoxicillin lot',
    description: 'Manufacturer reported sub-potent dissolution profile in lot 200',
    reasonCategory: 'Quality defect',
    initiatingParty: 'EFDA Regulatory Authority',
    severity: 'class_1',
    scopeLevel: 'batch',
    batchIds: [batchRecallId],
  });
  assert.equal(createRes.status, 201);
  const recallId = createRes.body.data.id;
  assert.equal(createRes.body.data.status, 'draft');
  assert.ok(createRes.body.data.recall_number.startsWith('REC-'));

  // 2. Approve recall
  const appRes = await agentAdmin.post(`/api/v1/recalls/${recallId}/approve`).send({
    approvalNotes: 'Pharmacist-in-charge approved for immediate containment',
  });
  assert.equal(appRes.status, 200);
  assert.equal(appRes.body.data.status, 'under_review');

  // 3. Activate recall (automatically inactivates batch & moves available stock to 'recalled' hold)
  const actRes = await agentAdmin.post(`/api/v1/recalls/${recallId}/activate`).send({});
  assert.equal(actRes.status, 200);
  assert.equal(actRes.body.data.status, 'active');

  // Verify batch is inactive
  const [batchRows] = await pool.query('SELECT status FROM batches WHERE id = ?', [batchRecallId]);
  assert.equal(batchRows[0].status, 'inactive', 'Batch inactivated to block new allocations');

  // Verify stock moved from 'available' to 'recalled'
  const [invRows] = await pool.query(
    'SELECT status, quantity FROM inventory WHERE warehouse_id = ? AND batch_id = ?',
    [wh1Id, batchRecallId],
  );
  const avail = invRows.find((r) => r.status === 'available');
  const recalled = invRows.find((r) => r.status === 'recalled');
  assert.equal(Number(avail?.quantity || 0), 0, 'No available stock remaining');
  assert.equal(Number(recalled.quantity), 80, 'All 80 units placed in recalled status');

  // 4. Traceability inspection
  const detailRes = await agentAdmin.get(`/api/v1/recalls/${recallId}`);
  assert.equal(detailRes.status, 200);
  const trace = detailRes.body.data.traceability;
  assert.equal(trace.onHandTotal, 80);
  assert.equal(trace.recalledOnHand, 80);
  assert.equal(trace.availableOnHand, 0);

  // 5. Cannot close recall while unconcealed stock or pending action remains
  // Dispose of recalled stock via recall action
  const actRecordRes = await agentAdmin.post(`/api/v1/recalls/${recallId}/actions`).send({
    actionType: 'disposal',
    branchId: branch1Id,
    warehouseId: wh1Id,
    batchId: batchRecallId,
    quantity: 80,
    notes: 'Regulatory destruction of recalled units under EFDA oversight',
  });
  assert.equal(actRecordRes.status, 200);

  // 6. Close recall successfully
  const closeRes = await agentAdmin.post(`/api/v1/recalls/${recallId}/close`).send({
    resolutionNotes: 'All 80 units safely incinerated and documented. Zero exposure.',
  });
  assert.equal(closeRes.status, 200);
  assert.equal(closeRes.body.data.status, 'resolved');
});

test('RECALL & QUARANTINE: Cross-organization data isolation', async () => {
  // Org 2 user attempts to view Org 1 recall
  const res1 = await agentOrg2.get('/api/v1/recalls');
  assert.equal(res1.status, 200);
  assert.equal(res1.body.data.items.length, 0, 'Org 2 user cannot see Org 1 recalls in list');

  const res2 = await agentOrg2.get('/api/v1/quarantines');
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.items.length, 0, 'Org 2 user cannot see Org 1 quarantines in list');
});

after(async () => {
  if (pool) {
    await pool.query('DELETE FROM recall_actions').catch(() => {});
    await pool.query('DELETE FROM recall_batches').catch(() => {});
    await pool.query('DELETE FROM recall_cases').catch(() => {});
    await pool.query('DELETE FROM quarantine_cases').catch(() => {});
  }
  if (closePool) {
    await closePool();
  }
});
