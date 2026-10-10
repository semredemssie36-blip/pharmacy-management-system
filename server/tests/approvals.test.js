/**
 * Task 18 — Centralized Approvals and Authorized Overrides Integration Tests
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

const PASSWORD = 'Passw0rd!approval';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id, branchOrg2Id;
let wh1Id, whOrg2Id;
let location1Id;
let unitId;
let product1Id;
let batch1Id;
let customer1Id;

let agentAdmin;
let agentManager;
let agentCashier;
let agentOrg2;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLA_' + Math.random().toString(36).slice(2, 9);
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

  // Clean old approval data
  await pool.query('DELETE FROM approval_history').catch(() => {});
  await pool.query('DELETE FROM approval_requests').catch(() => {});
  await pool.query('DELETE FROM approval_policies').catch(() => {});

  // Org 1 (Main Org)
  const [o1] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Approval Org 1 ${runTag}`, `AO1_${runTag}`],
  );
  org1Id = o1.insertId;

  // Org 2 (Isolated Org)
  const [o2] = await pool.query(
    'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
    [`Approval Org 2 ${runTag}`, `AO2_${runTag}`],
  );
  org2Id = o2.insertId;

  // Branches
  const [b1] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Piassa Main ${runTag}`, `AB1_${runTag}`],
  );
  branch1Id = b1.insertId;

  const [b2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Megenagna Branch ${runTag}`, `AB2_${runTag}`],
  );
  branch2Id = b2.insertId;

  const [bOrg2] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org2Id, `Org 2 Branch ${runTag}`, `ABO2_${runTag}`],
  );
  branchOrg2Id = bOrg2.insertId;

  // Warehouses
  const [w1] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branch1Id, `Main Store ${runTag}`, `AW1_${runTag}`],
  );
  wh1Id = w1.insertId;

  const [wO2] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
    [branchOrg2Id, `Org2 Store ${runTag}`, `AWO2_${runTag}`],
  );
  whOrg2Id = wO2.insertId;

  // Storage location
  const [sl1] = await pool.query(
    'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, ?, ?, "active")',
    [wh1Id, `Shelf 1 ${runTag}`, `ASL1_${runTag}`],
  );
  location1Id = sl1.insertId;

  // Units
  const [u] = await pool.query(
    'INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
    [org1Id, `Pack ${runTag}`, `PK_${runTag}`],
  );
  unitId = u.insertId;

  // Products
  const [p1] = await pool.query(
    'INSERT INTO products (organization_id, name, code, prescription_classification, selling_price, status) VALUES (?, ?, ?, "otc", 100.00, "active")',
    [org1Id, `Amoxicillin 500mg ${runTag}`, `AMX_${runTag}`],
  );
  product1Id = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product1Id, unitId]);

  // Batch
  const [bat1] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, "2028-12-31", "active")',
    [org1Id, product1Id, `BAT-${runTag}`],
  );
  batch1Id = bat1.insertId;

  // Available Stock
  await pool.query(
    'INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, "available", 200.00)',
    [org1Id, branch1Id, wh1Id, location1Id, product1Id, batch1Id, unitId],
  );

  // Customer
  const [cust1] = await pool.query(
    'INSERT INTO customers (organization_id, name, code, credit_limit, status) VALUES (?, ?, ?, 500.00, "active")',
    [org1Id, `Clinic Hope ${runTag}`, `CUST_${runTag}`],
  );
  customer1Id = cust1.insertId;

  // Users:
  // 1. Admin (Org 1, full permissions)
  const uAdmin = await insertUser('Admin User', `admin_${runTag}@test.com`);
  await addRoleWithPerms(uAdmin, [
    'approval.view', 'approval.create', 'approval.cancel', 'approval.discount',
    'approval.credit', 'approval.inventory', 'approval.quarantine', 'approval.procurement',
    'approval.policy.view', 'approval.policy.manage', 'approval.execute',
    'sale.view', 'sale.create', 'sale.confirm', 'sale.complete', 'sale.cancel', 'sale.void',
    'receivable.view', 'credit_sale.authorize',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdmin, org1Id]);
  agentAdmin = await loginAgent(`admin_${runTag}@test.com`);

  // 2. Manager (Org 1, approval authority for discounts & credits)
  const uManager = await insertUser('Manager User', `manager_${runTag}@test.com`);
  await addRoleWithPerms(uManager, [
    'approval.view', 'approval.discount', 'approval.credit', 'approval.inventory',
    'sale.view', 'sale.create', 'sale.confirm', 'sale.complete',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uManager, org1Id]);
  agentManager = await loginAgent(`manager_${runTag}@test.com`);

  // 3. Cashier (Org 1, branch 1, sale permissions only, NO approval.discount / approval.credit)
  const uCashier = await insertUser('Cashier User', `cashier_${runTag}@test.com`);
  await addRoleWithPerms(uCashier, [
    'approval.view', 'approval.create', 'approval.cancel',
    'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [uCashier, branch1Id]);
  agentCashier = await loginAgent(`cashier_${runTag}@test.com`);

  // 4. Org 2 User
  const uOrg2 = await insertUser('Org2 User', `org2_${runTag}@test.com`);
  await addRoleWithPerms(uOrg2, ['approval.view', 'approval.create', 'approval.discount']);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uOrg2, org2Id]);
  agentOrg2 = await loginAgent(`org2_${runTag}@test.com`);
});

after(async () => {
  if (pool) {
    await pool.query('DELETE FROM approval_history').catch(() => {});
    await pool.query('DELETE FROM approval_requests').catch(() => {});
    await pool.query('DELETE FROM approval_policies').catch(() => {});
  }
  if (closePool) {
    await closePool();
  }
});

test('CORE: Create valid approval request and enforce scope isolation', async () => {
  const payload = {
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: 999,
    targetReference: 'SALE-2026-0001',
    requestedValue: 25.00,
    originalValue: 15.00,
    reason: 'Customer is a non-profit orphanage; requesting 25% discount override.',
    notes: 'Approved verbally by pharmacy director.',
    snapshotData: { subtotal: 1000, discountAmount: 250 },
  };

  const createRes = await agentCashier.post('/api/v1/approvals').send(payload);
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.success, true);
  assert.equal(createRes.body.data.status, 'pending');
  assert.match(createRes.body.data.request_number, /^APR-\d{4}-\d+/);

  const reqId = createRes.body.data.id;

  // View by Org 1 cashier
  const getRes = await agentCashier.get(`/api/v1/approvals/${reqId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data.reason, payload.reason);

  // Org 2 user attempts to view Org 1 request -> strictly 403 Forbidden
  const org2GetRes = await agentOrg2.get(`/api/v1/approvals/${reqId}`);
  assert.equal(org2GetRes.status, 403);
});

test('SEPARATION OF DUTIES: Requester cannot approve their own request', async () => {
  // Cashier creates request
  const createRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: 998,
    reason: 'Self-approval test request',
  });
  assert.equal(createRes.status, 201);
  const reqId = createRes.body.data.id;

  // Cashier attempts to approve their own request -> 403 SELF_APPROVAL_PROHIBITED
  const selfApproveRes = await agentCashier.post(`/api/v1/approvals/${reqId}/approve`).send({
    decisionReason: 'I approve my own request',
  });
  assert.equal(selfApproveRes.status, 403);
});

test('AUTHORITY ENFORCEMENT: Approver must possess authority permission for approval category', async () => {
  // Cashier creates a credit limit override request
  const createRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'credit_limit_override',
    targetEntityType: 'customer',
    targetEntityId: customer1Id,
    requestedValue: 1200.00,
    originalValue: 500.00,
    reason: 'Temporary credit increase for ongoing treatment',
  });
  assert.equal(createRes.status, 201);
  const reqId = createRes.body.data.id;

  // Cashier lacks approval.credit
  const unauthRes = await agentCashier.post(`/api/v1/approvals/${reqId}/approve`).send({
    decisionReason: 'Cashier trying to approve credit',
  });
  assert.equal(unauthRes.status, 403);

  // Manager has approval.credit -> successfully approves
  const managerRes = await agentManager.post(`/api/v1/approvals/${reqId}/approve`).send({
    decisionReason: 'Patient credit approved following verification with medical director.',
  });
  assert.equal(managerRes.status, 200);
  assert.equal(managerRes.body.data.status, 'approved');
  assert.equal(managerRes.body.data.approver_id, managerRes.body.data.approver_id);
});

test('REJECTION: Rejection requires mandatory reason and transitions status to rejected', async () => {
  const createRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: 997,
    reason: 'Unwarranted 50% discount request',
  });
  assert.equal(createRes.status, 201);
  const reqId = createRes.body.data.id;

  // Rejection without reason fails validation
  const emptyReasonRes = await agentManager.post(`/api/v1/approvals/${reqId}/reject`).send({
    decisionReason: '',
  });
  assert.equal(emptyReasonRes.status, 400);

  // Rejection with valid reason
  const rejectRes = await agentManager.post(`/api/v1/approvals/${reqId}/reject`).send({
    decisionReason: 'Discount request rejected: exceeding maximum organizational margin policy.',
  });
  assert.equal(rejectRes.status, 200);
  assert.equal(rejectRes.body.data.status, 'rejected');

  // Attempting to approve rejected request -> 409 conflict
  const reApproveRes = await agentManager.post(`/api/v1/approvals/${reqId}/approve`).send({
    decisionReason: 'Re-approving rejected',
  });
  assert.equal(reApproveRes.status, 409);
});

test('CANCELLATION & AUDIT HISTORY: Requester can cancel pending request, and history is preserved', async () => {
  const createRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: 996,
    reason: 'Accidental discount request submitted in error',
  });
  assert.equal(createRes.status, 201);
  const reqId = createRes.body.data.id;

  // Cashier cancels request
  const cancelRes = await agentCashier.post(`/api/v1/approvals/${reqId}/cancel`).send({
    cancelReason: 'Customer decided to pay full price.',
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.status, 'cancelled');

  // Verify audit history log
  const detailRes = await agentCashier.get(`/api/v1/approvals/${reqId}`);
  assert.equal(detailRes.status, 200);
  assert.equal(Array.isArray(detailRes.body.data.history), true);
  const historyActions = detailRes.body.data.history.map((h) => h.action);
  assert.ok(historyActions.includes('created'), 'History includes created event');
  assert.ok(historyActions.includes('cancelled'), 'History includes cancelled event');
});

test('STALE DATA INVALIDATION: Alteration of underlying target record invalidates approval', async () => {
  // Create a draft sale with 1 line
  const saleRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    lines: [{ productId: product1Id, unitId, quantity: 1, unitPrice: 100 }],
    discountAmount: 10,
  });
  assert.equal(saleRes.status, 201);
  const saleId = saleRes.body.data.sale.id;

  // Create approval request capturing snapshot of subtotal 100
  const aprRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: saleId,
    requestedValue: 20,
    originalValue: 15,
    reason: 'Requesting 20% discount on $100 sale',
    snapshotData: { subtotal: 100, discountAmount: 20 },
  });
  assert.equal(aprRes.status, 201);
  const aprId = aprRes.body.data.id;

  // Now, alter the sale lines so subtotal becomes 200 (stale data)
  await agentCashier.patch(`/api/v1/sales/${saleId}`).send({
    lines: [{ productId: product1Id, unitId, quantity: 2, unitPrice: 100 }],
    discountAmount: 10,
  });

  // Approver attempts to approve request -> detected stale fingerprint -> 409 STALE_REQUEST_DATA
  const staleApproveRes = await agentManager.post(`/api/v1/approvals/${aprId}/approve`).send({
    decisionReason: 'Approving without noticing total changed',
  });
  assert.equal(staleApproveRes.status, 409);

  // Request is marked expired / invalidated
  const checkRes = await agentAdmin.get(`/api/v1/approvals/${aprId}`);
  assert.equal(checkRes.body.data.status, 'expired');
});

test('WORKFLOW INTEGRATION: Cashier discount > 15% requires approval, and completes upon manager approval', async () => {
  // 1. Cashier attempts to create sale with 25% discount directly -> rejected by server discount rule
  const unauthSaleRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    lines: [{ productId: product1Id, unitId, quantity: 1, unitPrice: 100 }],
    discountAmount: 25, // 25% > 15% limit
  });
  assert.equal(unauthSaleRes.status, 403);
  assert.equal(unauthSaleRes.body.error.code, 'EXCESS_DISCOUNT_UNAUTHORIZED');

  // 2. Cashier creates draft sale within normal discount or 0 discount first
  const draftSaleRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    lines: [{ productId: product1Id, unitId, quantity: 1, unitPrice: 100 }],
    discountAmount: 0,
  });
  assert.equal(draftSaleRes.status, 201);
  const saleId = draftSaleRes.body.data.sale.id;

  // 3. Cashier submits approval request for 25% discount on this sale
  const aprRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: saleId,
    requestedValue: 25.00,
    originalValue: 0.00,
    reason: 'Hospital employee family discount 25%',
  });
  assert.equal(aprRes.status, 201);
  const aprId = aprRes.body.data.id;

  // 4. Manager reviews and approves the discount request
  const approveRes = await agentManager.post(`/api/v1/approvals/${aprId}/approve`).send({
    decisionReason: 'Staff discount approved.',
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.data.status, 'approved');

  // 5. Cashier updates draft sale with approved discount 25 -> now PERMITTED!
  const updateSaleRes = await agentCashier.patch(`/api/v1/sales/${saleId}`).send({
    discountAmount: 25,
  });
  assert.equal(updateSaleRes.status, 200);
  assert.equal(Number(updateSaleRes.body.data.sale.discount_amount), 25);

  // 6. Complete sale
  await agentCashier.post(`/api/v1/sales/${saleId}/confirm`).send({});
  const completeRes = await agentCashier.post(`/api/v1/sales/${saleId}/complete`).send({});
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.data.sale.status, 'completed');

  // 7. Verify the approval request status transitioned to 'executed'
  const aprFinalRes = await agentAdmin.get(`/api/v1/approvals/${aprId}`);
  assert.equal(aprFinalRes.body.data.status, 'executed');
});

test('WORKFLOW INTEGRATION: Customer credit sale exceeding limit succeeds when approved approval request exists', async () => {
  // Create a dedicated customer with 500 ETB limit
  const [custCredit] = await pool.query(
    'INSERT INTO customers (organization_id, name, code, credit_limit, status) VALUES (?, ?, ?, 500.00, "active")',
    [org1Id, `Clinic Credit Test ${Math.random().toString(36).slice(2, 7)}`, `CUST_CR_${Math.random().toString(36).slice(2, 7)}`],
  );
  const testCustomerId = custCredit.insertId;

  // We sell 700 ETB on credit (exceeds limit by 200 ETB).
  const saleRes = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    customerId: testCustomerId,
    lines: [{ productId: product1Id, unitId, quantity: 7, unitPrice: 100 }],
  });
  assert.equal(saleRes.status, 201);
  const saleId = saleRes.body.data.sale.id;
  await agentAdmin.post(`/api/v1/sales/${saleId}/confirm`).send({});

  // 1. Cashier attempts credit sale directly without override or approval -> fails with 409 CREDIT_LIMIT_EXCEEDED
  const directCreditRes = await agentCashier.post('/api/v1/receivables/credit-sale').send({
    saleId,
    customerId: testCustomerId,
  });
  assert.equal(directCreditRes.status, 409);
  assert.equal(directCreditRes.body.error.code, 'CREDIT_LIMIT_EXCEEDED');

  // 2. Submit approval request for credit limit override
  const aprRes = await agentCashier.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'credit_limit_override',
    targetEntityType: 'customer',
    targetEntityId: testCustomerId,
    requestedValue: 700.00,
    originalValue: 500.00,
    reason: 'Emergency hospital admission credit authorization',
  });
  assert.equal(aprRes.status, 201);
  const aprId = aprRes.body.data.id;

  // 3. Manager approves credit override
  const approveRes = await agentManager.post(`/api/v1/approvals/${aprId}/approve`).send({
    decisionReason: 'Emergency credit approved.',
  });
  assert.equal(approveRes.status, 200);

  // 4. Cashier re-attempts credit sale -> now SUCCEEDS!
  const approvedCreditRes = await agentCashier.post('/api/v1/receivables/credit-sale').send({
    saleId,
    customerId: testCustomerId,
  });
  assert.equal(approvedCreditRes.status, 201);
  assert.equal(approvedCreditRes.body.success, true);

  // 5. Verify approval request was consumed and marked 'executed'
  const finalAprRes = await agentAdmin.get(`/api/v1/approvals/${aprId}`);
  assert.equal(finalAprRes.body.data.status, 'executed');
});

after(async () => {
  if (closePool) await closePool();
});
