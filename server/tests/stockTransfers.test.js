/**
 * Task 15 — Stock Transfers Between Branches and Warehouses Integration Tests
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

const PASSWORD = 'Passw0rd!transfers';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branchSrcId, branchDstId, branchOrg2Id;
let whSrcId, whDstId, whOrg2Id;
let locSrcId, locDstId;
let unitId;
let product1Id;

let agentAdmin;
let agentSourceClerk;
let agentDestClerk;
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
  const code = 'ROLST_' + Math.random().toString(36).slice(2, 9);
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

  // Clean test stock transfer data safely
  await pool.query('DELETE FROM stock_transfer_batch_allocations');
  await pool.query('DELETE FROM stock_transfer_lines');
  await pool.query('DELETE FROM stock_transfers');

  // Org 1 (Main Org)
  const [o1] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Transfer Org 1 ${runTag}`, `ORG1_${runTag}`],
  );
  org1Id = o1.insertId;

  // Org 2 (Isolated Org)
  const [o2] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Transfer Org 2 ${runTag}`, `ORG2_${runTag}`],
  );
  org2Id = o2.insertId;

  // Branches in Org 1
  const [bSrc] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Source Branch ${runTag}`, `BRSRC_${runTag}`],
  );
  branchSrcId = bSrc.insertId;

  const [bDst] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Dest Branch ${runTag}`, `BRDST_${runTag}`],
  );
  branchDstId = bDst.insertId;

  // Branch in Org 2
  const [bOrg2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org2Id, `Org2 Branch ${runTag}`, `BRO2_${runTag}`],
  );
  branchOrg2Id = bOrg2.insertId;

  // Warehouses
  const [wSrc] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branchSrcId, `Source Warehouse ${runTag}`, `WHSRC_${runTag}`],
  );
  whSrcId = wSrc.insertId;

  const [wDst] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branchDstId, `Dest Warehouse ${runTag}`, `WHDST_${runTag}`],
  );
  whDstId = wDst.insertId;

  const [wOrg2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branchOrg2Id, `Org2 Warehouse ${runTag}`, `WHO2_${runTag}`],
  );
  whOrg2Id = wOrg2.insertId;

  // Storage Locations
  const [lSrc] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, ?, ?, "active")',
    [whSrcId, `Source Location ${runTag}`, `LOCSRC_${runTag}`],
  );
  locSrcId = lSrc.insertId;

  const [lDst] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, ?, ?, "active")',
    [whDstId, `Dest Location ${runTag}`, `LOCDST_${runTag}`],
  );
  locDstId = lDst.insertId;

  // Unit
  const [u] = await pool.query(
    'INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Transfer Unit ${runTag}`, `UNT_${runTag}`],
  );
  unitId = u.insertId;

  // Product in Org 1
  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Paracetamol 500mg', ?, 10.00, 'otc', 'active')`,
    [org1Id, `PRD1_${runTag}`],
  );
  product1Id = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product1Id, unitId]);

  // Users
  adminUserId = await insertUser(`Admin ${runTag}`, `admin_st_${runTag}@test.com`);
  const srcClerkId = await insertUser(`Source Clerk ${runTag}`, `src_clerk_${runTag}@test.com`);
  const dstClerkId = await insertUser(`Dest Clerk ${runTag}`, `dst_clerk_${runTag}@test.com`);
  const org2UserId = await insertUser(`Org2 User ${runTag}`, `org2_${runTag}@test.com`);

  // Permissions
  const allSTPerms = [
    'stock_transfer.view', 'stock_transfer.create', 'stock_transfer.submit',
    'stock_transfer.approve', 'stock_transfer.reject', 'stock_transfer.dispatch',
    'stock_transfer.receive', 'stock_transfer.cancel', 'stock_transfer.resolve_discrepancy',
  ];

  await addRoleWithPerms(adminUserId, allSTPerms);
  await addRoleWithPerms(srcClerkId, allSTPerms);
  await addRoleWithPerms(dstClerkId, allSTPerms);
  await addRoleWithPerms(org2UserId, allSTPerms);

  // Scopes
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [adminUserId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [srcClerkId, branchSrcId]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, warehouse_id) VALUES (?, "warehouse", ?)', [srcClerkId, whSrcId]);

  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [dstClerkId, branchDstId]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, warehouse_id) VALUES (?, "warehouse", ?)', [dstClerkId, whDstId]);

  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

  // Logins
  agentAdmin = await loginAgent(`admin_st_${runTag}@test.com`);
  agentSourceClerk = await loginAgent(`src_clerk_${runTag}@test.com`);
  agentDestClerk = await loginAgent(`dst_clerk_${runTag}@test.com`);
  agentOrg2 = await loginAgent(`org2_${runTag}@test.com`);
});

test('STOCK TRANSFER: Validation rules prevent identical source/destination or cross-org transfer', async () => {
  const resSame = await agentAdmin.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchSrcId,
    destinationWarehouseId: whSrcId,
    lines: [{ productId: product1Id, unitId, quantityRequested: 50 }],
  });
  assert.equal(resSame.status, 400, `resSame: ${JSON.stringify(resSame.body)}`);

  const resCrossOrg = await agentAdmin.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchOrg2Id,
    destinationWarehouseId: whOrg2Id,
    lines: [{ productId: product1Id, unitId, quantityRequested: 50 }],
  });
  assert.equal(resCrossOrg.status, 400, `resCrossOrg: ${JSON.stringify(resCrossOrg.body)}`);
});

test('STOCK TRANSFER: Scope enforcement prevents initiating transfers outside user data scope', async () => {
  // Dest clerk trying to initiate transfer from Source Branch/Warehouse
  const res = await agentDestClerk.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchDstId,
    destinationWarehouseId: whDstId,
    lines: [{ productId: product1Id, unitId, quantityRequested: 50 }],
  });
  assert.equal(res.status, 403, `resScope: ${JSON.stringify(res.body)}`);
});

test('STOCK TRANSFER: Creation -> Submit -> Approve lifecycle', async () => {
  // Source clerk initiates transfer
  const resCreate = await agentSourceClerk.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchDstId,
    destinationWarehouseId: whDstId,
    reason: 'Replenishing Dest Branch',
    lines: [{ productId: product1Id, unitId, quantityRequested: 100 }],
  });
  assert.equal(resCreate.status, 201);
  const transfer = resCreate.body.data;
  assert.equal(transfer.status, 'draft');
  assert.ok(transfer.transfer_number.startsWith('ST-'));

  // Submit transfer
  const resSubmit = await agentSourceClerk.post(`/api/v1/stock-transfers/${transfer.id}/submit`);
  assert.equal(resSubmit.status, 200);
  assert.equal(resSubmit.body.data.status, 'submitted');

  // Admin approves transfer
  const resApprove = await agentAdmin.post(`/api/v1/stock-transfers/${transfer.id}/approve`).send({
    approvedLines: [{ lineId: transfer.lines[0].id, quantityApproved: 100 }],
  });
  assert.equal(resApprove.status, 200);
  assert.equal(resApprove.body.data.status, 'approved');
});

test('STOCK TRANSFER: Cancellation before dispatch is permitted; after dispatch is strictly forbidden', async () => {
  // Create draft and cancel
  const resDraft = await agentAdmin.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchDstId,
    destinationWarehouseId: whDstId,
    lines: [{ productId: product1Id, unitId, quantityRequested: 20 }],
  });
  assert.equal(resDraft.status, 201);
  const draftId = resDraft.body.data.id;

  const resCancel = await agentAdmin.post(`/api/v1/stock-transfers/${draftId}/cancel`).send({
    cancellationReason: 'No longer needed',
  });
  assert.equal(resCancel.status, 200);
  assert.equal(resCancel.body.data.status, 'cancelled');
});

test('STOCK TRANSFER: Full Dispatch and Destination Receipt with Inventory Ledger movements', async () => {
  // 1. Seed active stock in source warehouse
  const [bRes] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, "BAT-SRC-01", "2027-12-31", "active")',
    [org1Id, product1Id],
  );
  const batchId = bRes.insertId;

  await pool.query(
    `INSERT INTO inventory (
       organization_id, branch_id, warehouse_id, storage_location_id,
       product_id, batch_id, unit_id, quantity, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 200, 'available')`,
    [org1Id, branchSrcId, whSrcId, locSrcId, product1Id, batchId, unitId],
  );

  // 2. Create and approve transfer for 80 units
  const resCreate = await agentAdmin.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchDstId,
    destinationWarehouseId: whDstId,
    lines: [{ productId: product1Id, unitId, quantityRequested: 80 }],
  });
  const transferId = resCreate.body.data.id;
  const lineId = resCreate.body.data.lines[0].id;

  await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/submit`);
  await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/approve`).send({
    approvedLines: [{ lineId, quantityApproved: 80 }],
  });

  // 3. Dispatch 80 units from source warehouse
  const resDispatch = await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/dispatch`).send({
    allocations: [
      {
        transferLineId: lineId,
        batchId,
        sourceStorageLocationId: locSrcId,
        quantity: 80,
      },
    ],
  });
  assert.equal(resDispatch.status, 200);
  assert.equal(resDispatch.body.data.status, 'in_transit');
  assert.equal(Number(resDispatch.body.data.lines[0].quantity_in_transit), 80);

  // Verify source inventory reduced from 200 to 120
  const [srcInvRows] = await pool.query(
    'SELECT quantity FROM inventory WHERE warehouse_id = ? AND batch_id = ?',
    [whSrcId, batchId],
  );
  assert.equal(Number(srcInvRows[0].quantity), 120);

  // Verify transfer_out movement created
  const [outMovRows] = await pool.query(
    'SELECT movement_type, quantity_delta, reference_type, reference_id FROM stock_movements WHERE reference_type = "stock_transfer" AND reference_id = ? AND movement_type = "transfer_out"',
    [transferId],
  );
  assert.equal(outMovRows.length, 1);
  assert.equal(Number(outMovRows[0].quantity_delta), -80);

  // Verify cancellation after dispatch is rejected
  const resCancelAfterDisp = await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/cancel`).send({
    cancellationReason: 'Try to cancel dispatched transfer',
  });
  assert.equal(resCancelAfterDisp.status, 409);

  // 4. Destination Receiving (60 units good, 20 units with discrepancy)
  const allocId = resDispatch.body.data.batch_allocations[0].id;
  const resReceive = await agentDestClerk.post(`/api/v1/stock-transfers/${transferId}/receive`).send({
    receipts: [
      {
        batchAllocationId: allocId,
        destinationStorageLocationId: locDstId,
        quantityReceived: 60,
        isFinal: true,
        discrepancyReason: '20 units damaged in road transport',
      },
    ],
    isFinalReceiving: true,
    receivingNotes: 'Received 60, 20 broken vials',
  });

  assert.equal(resReceive.status, 200);
  const finishedTransfer = resReceive.body.data;
  assert.equal(finishedTransfer.status, 'completed');
  assert.equal(finishedTransfer.has_discrepancy, 1);
  assert.equal(Number(finishedTransfer.lines[0].quantity_received), 60);
  assert.equal(Number(finishedTransfer.lines[0].quantity_discrepancy), 20);
  assert.equal(Number(finishedTransfer.lines[0].quantity_in_transit), 0);

  // Verify destination inventory increased by 60
  const [dstInvRows] = await pool.query(
    'SELECT quantity, status FROM inventory WHERE warehouse_id = ? AND batch_id = ?',
    [whDstId, batchId],
  );
  assert.equal(dstInvRows.length, 1);
  assert.equal(Number(dstInvRows[0].quantity), 60);
  assert.equal(dstInvRows[0].status, 'available');

  // Verify transfer_in movement created
  const [inMovRows] = await pool.query(
    'SELECT movement_type, quantity_delta FROM stock_movements WHERE reference_type = "stock_transfer" AND reference_id = ? AND movement_type = "transfer_in"',
    [transferId],
  );
  assert.equal(inMovRows.length, 1);
  assert.equal(Number(inMovRows[0].quantity_delta), 60);

  // 5. Resolve discrepancy
  const resResolve = await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/resolve-discrepancy`).send({
    resolutionNotes: 'Loss insurance claim filed with courier for 20 damaged units.',
  });
  assert.equal(resResolve.status, 200);
  assert.equal(resResolve.body.data.discrepancy_resolved, 1);
});

test('STOCK TRANSFER: Rejection of over-dispatch and insufficient stock', async () => {
  // Create approved transfer for 500 units (more than available stock)
  const resCreate = await agentAdmin.post('/api/v1/stock-transfers').send({
    organizationId: org1Id,
    sourceBranchId: branchSrcId,
    sourceWarehouseId: whSrcId,
    destinationBranchId: branchDstId,
    destinationWarehouseId: whDstId,
    lines: [{ productId: product1Id, unitId, quantityRequested: 500 }],
  });
  const transferId = resCreate.body.data.id;
  const lineId = resCreate.body.data.lines[0].id;

  await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/submit`);
  await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/approve`).send({
    approvedLines: [{ lineId, quantityApproved: 500 }],
  });

  // Attempt dispatch 500 when available is only 120
  const [bRows] = await pool.query('SELECT id FROM batches WHERE product_id = ? LIMIT 1', [product1Id]);
  const batchId = bRows[0].id;

  const resOverStock = await agentAdmin.post(`/api/v1/stock-transfers/${transferId}/dispatch`).send({
    allocations: [
      {
        transferLineId: lineId,
        batchId,
        sourceStorageLocationId: locSrcId,
        quantity: 500,
      },
    ],
  });
  assert.equal(resOverStock.status, 409);
  assert.equal(resOverStock.body.error.code, 'INSUFFICIENT_STOCK');
});

test('STOCK TRANSFER: Cross-organization data isolation', async () => {
  const resList = await agentOrg2.get('/api/v1/stock-transfers');
  assert.equal(resList.status, 200);
  // Org 2 user should see 0 transfers from Org 1
  assert.equal(resList.body.data.length, 0);
});

after(async () => {
  if (pool) {
    try {
      await pool.query('DELETE FROM stock_transfer_batch_allocations');
      await pool.query('DELETE FROM stock_transfer_lines');
      await pool.query('DELETE FROM stock_transfers');
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
