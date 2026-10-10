/**
 * Task 13 — Payments, Customer Credit & Accounts Receivable Tests:
 * - Payment creation, listing, detail, scoping & permissions
 * - POS Sales integration (full, partial, split, stock consumption, idempotency)
 * - Dispensing integration (verification gate, final stock deduction, no double Rx update)
 * - Customer credit sales & credit limit enforcement (with & without override)
 * - Accounts receivable tracking & payment allocation
 * - Manual verification and cancellation of pending payments
 * - Authorized refunds and financial reversals without inventory restocking
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

const PASSWORD = 'Passw0rd!payments';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id;
let warehouse1Id;
let location1Id;
let unitBaseId;
let customerActiveId, customerCreditLimitedId, customerInactiveId, customerOrg2Id;
let product1Id, product2Id;

let agentAdmin;
let agentCashier;
let agentNoPerms;
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
  const code = 'ROLPAY_' + Math.random().toString(36).slice(2, 9);
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

async function seedBatchStock({ productId, batchNumber, expiryDate, quantity }) {
  const [bRes] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, ?, "active")',
    [org1Id, productId, batchNumber, expiryDate],
  );
  const batchId = bRes.insertId;
  const [invRes] = await pool.query(
    `INSERT INTO inventory (
       organization_id, branch_id, warehouse_id, storage_location_id,
       product_id, batch_id, unit_id, quantity, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
    [org1Id, branch1Id, warehouse1Id, location1Id, productId, batchId, unitBaseId, quantity],
  );
  return { batchId, inventoryId: invRes.insertId };
}

before(async () => {
  const { runMigrations } = await import('../src/database/migrate.js');
  await runMigrations();

  const poolMod = await import('../src/database/pool.js');
  pool = poolMod.getPool();
  closePool = poolMod.closePool;
  app = (await import('../src/app.js')).default;

  const runTag = Math.random().toString(36).slice(2, 8);

  // Organizations
  const [o1] = await pool.query(`INSERT INTO organizations (name, code, status) VALUES ('Pay Org 1', 'PO1_${runTag}', 'active')`);
  org1Id = o1.insertId;
  const [o2] = await pool.query(`INSERT INTO organizations (name, code, status) VALUES ('Pay Org 2', 'PO2_${runTag}', 'active')`);
  org2Id = o2.insertId;

  // Branches
  const [b1] = await pool.query(`INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Pay Branch 1', 'PB1_${runTag}', 'active')`, [org1Id]);
  branch1Id = b1.insertId;
  const [b2] = await pool.query(`INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Pay Branch 2', 'PB2_${runTag}', 'active')`, [org2Id]);
  branch2Id = b2.insertId;

  // Warehouses
  const [w1] = await pool.query(`INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Pay Warehouse 1', 'PW1_${runTag}', 'active')`, [branch1Id]);
  warehouse1Id = w1.insertId;

  // Locations
  const [l1] = await pool.query(`INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, 'Pay Rack 1', 'PR1_${runTag}', 'active')`, [warehouse1Id]);
  location1Id = l1.insertId;

  // Units
  const [u1] = await pool.query(`INSERT INTO units (organization_id, name, code, status) VALUES (?, 'Piece', 'PCS_${runTag}', 'active')`, [org1Id]);
  unitBaseId = u1.insertId;

  // Products
  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Paracetamol 500mg', 'PARA_${runTag}', 50.00, 'otc', 'active')`,
    [org1Id],
  );
  product1Id = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product1Id, unitBaseId]);

  const [p2] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Amoxicillin 500mg', 'AMOX_${runTag}', 100.00, 'prescription', 'active')`,
    [org1Id],
  );
  product2Id = p2.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product2Id, unitBaseId]);

  // Customers
  const [c1] = await pool.query(
    `INSERT INTO customers (organization_id, name, code, customer_type, credit_limit, status) VALUES (?, 'Regular Customer', 'CR_${runTag}', 'individual', 5000.00, 'active')`,
    [org1Id],
  );
  customerActiveId = c1.insertId;

  const [c2] = await pool.query(
    `INSERT INTO customers (organization_id, name, code, customer_type, credit_limit, status) VALUES (?, 'Low Limit Customer', 'CL_${runTag}', 'individual', 500.00, 'active')`,
    [org1Id],
  );
  customerCreditLimitedId = c2.insertId;

  const [c3] = await pool.query(
    `INSERT INTO customers (organization_id, name, code, customer_type, credit_limit, status) VALUES (?, 'Inactive Customer', 'CI_${runTag}', 'individual', 2000.00, 'inactive')`,
    [org1Id],
  );
  customerInactiveId = c3.insertId;

  const [c4] = await pool.query(
    `INSERT INTO customers (organization_id, name, code, customer_type, credit_limit, status) VALUES (?, 'Org 2 Customer', 'CO2_${runTag}', 'individual', 1000.00, 'active')`,
    [org2Id],
  );
  customerOrg2Id = c4.insertId;

  // Users
  const uAdminId = await insertUser('Admin Pay User', `admin_pay_${runTag}@test.local`);
  adminUserId = uAdminId;
  const uCashierId = await insertUser('Cashier User', `cashier_pay_${runTag}@test.local`);
  const uNoPermsId = await insertUser('No Perms User', `noperms_pay_${runTag}@test.local`);
  const uOrg2Id = await insertUser('Org2 Pay User', `org2_pay_${runTag}@test.local`);

  // Scopes
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdminId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [uCashierId, branch1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uCashierId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uNoPermsId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uOrg2Id, org2Id]);

  // Roles & Permissions
  await addRoleWithPerms(uAdminId, [
    'payment.view', 'payment.create', 'payment.verify', 'payment.cancel', 'payment.refund',
    'receivable.view', 'receivable.manage', 'credit_sale.authorize',
    'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete', 'sale.cancel', 'sale.void',
    'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate', 'dispensing.verify', 'dispensing.cancel',
    'customer.view', 'customer.create', 'customer.update',
    'product.view', 'inventory.view',
  ]);

  await addRoleWithPerms(uCashierId, [
    'payment.view', 'payment.create',
    'receivable.view',
    'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete',
    'dispensing.view',
    'customer.view', 'product.view', 'inventory.view',
  ]);

  await addRoleWithPerms(uOrg2Id, [
    'payment.view', 'payment.create', 'receivable.view', 'sale.view', 'sale.create',
  ]);

  agentAdmin = await loginAgent(`admin_pay_${runTag}@test.local`);
  agentCashier = await loginAgent(`cashier_pay_${runTag}@test.local`);
  agentNoPerms = await loginAgent(`noperms_pay_${runTag}@test.local`);
  agentOrg2 = await loginAgent(`org2_pay_${runTag}@test.local`);
});

after(async () => {
  if (pool) {
    try {
      await pool.query('DELETE FROM customer_return_lines');
      await pool.query('DELETE FROM customer_returns');
      await pool.query('DELETE FROM supplier_return_lines');
      await pool.query('DELETE FROM supplier_returns');
      await pool.query('DELETE FROM refunds');
      await pool.query('DELETE FROM payment_allocations');
      await pool.query('DELETE FROM customer_receivables');
      await pool.query('DELETE FROM payments');
      await pool.query('DELETE FROM dispensing_batch_allocations');
      await pool.query('DELETE FROM dispensing_lines');
      await pool.query('DELETE FROM dispensings');
      await pool.query('DELETE FROM prescription_refills');
      await pool.query('DELETE FROM prescription_lines');
      await pool.query('DELETE FROM prescriptions');
      await pool.query('DELETE FROM patients');
      await pool.query('DELETE FROM prescribers');
      await pool.query('DELETE FROM sale_batch_allocations');
      await pool.query('DELETE FROM sale_lines');
      await pool.query('DELETE FROM sales');
      await pool.query('DELETE FROM stock_movements');
      await pool.query('DELETE FROM inventory');
      await pool.query('DELETE FROM batches');
      await pool.query('DELETE FROM product_units');
      await pool.query('DELETE FROM products');
      await pool.query('DELETE FROM customers');
      await pool.query('DELETE FROM units');
      await pool.query('DELETE FROM storage_locations');
      await pool.query('DELETE FROM warehouses');
      await pool.query('DELETE FROM branches');
      await pool.query('DELETE FROM organizations');
      await pool.query('DELETE FROM user_scopes');
      await pool.query('DELETE FROM user_roles');
      await pool.query('DELETE FROM users');
    } catch (e) {
      // ignore cleanup errors on tear-down
    }
  }
  if (closePool) await closePool();
});

test('PERMISSIONS & SCOPE: unauthenticated and unauthorized requests are blocked', async () => {
  const unauthRes = await request(app).get('/api/v1/payments');
  assert.equal(unauthRes.status, 401);

  const noPermRes = await agentNoPerms.get('/api/v1/payments');
  assert.equal(noPermRes.status, 403);

  const noPermCreate = await agentNoPerms.post('/api/v1/payments').send({ amount: 100, paymentMethod: 'cash' });
  assert.equal(noPermCreate.status, 403);
});

test('VALIDATION: invalid payment amount or payment method rejected', async () => {
  const zeroAmt = await agentCashier.post('/api/v1/payments').send({ amount: 0, paymentMethod: 'cash' });
  assert.equal(zeroAmt.status, 400);

  const negAmt = await agentCashier.post('/api/v1/payments').send({ amount: -50, paymentMethod: 'cash' });
  assert.equal(negAmt.status, 400);

  const badMethod = await agentCashier.post('/api/v1/payments').send({ amount: 100, paymentMethod: 'bitcoin' });
  assert.equal(badMethod.status, 400);
});

test('POS SALES INTEGRATION: full cash payment completes sale, consumes FEFO inventory exactly once', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);

  await seedBatchStock({
    productId: product1Id,
    batchNumber: `POS-PAY-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 20,
  });

  // 1. Create sale: 2 pieces of Paracetamol @ 50.00 ETB = 100.00 ETB
  const saleRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 2 }],
  });
  assert.equal(saleRes.status, 201);
  const saleId = saleRes.body.data.sale.id;
  assert.equal(Number(saleRes.body.data.sale.total_amount), 100.00);

  // 2. Record full cash payment: 100.00 ETB
  const payRes = await agentCashier.post('/api/v1/payments').send({
    referenceType: 'sale',
    referenceId: saleId,
    amount: 100.00,
    paymentMethod: 'cash',
  });
  assert.equal(payRes.status, 201);
  const payment = payRes.body.data.payment;
  assert.equal(payment.status, 'completed');
  assert.equal(Number(payment.amount), 100.00);

  // 3. Verify Sale status is completed, payment_status is 'paid', paid_amount is 100.00
  const saleAfter = (await agentCashier.get(`/api/v1/sales/${saleId}`)).body.data.sale;
  assert.equal(saleAfter.status, 'completed');
  assert.equal(saleAfter.payment_status, 'paid');
  assert.equal(Number(saleAfter.paid_amount), 100.00);

  // 4. Verify inventory deduction: exactly 2 deducted (20 - 2 = 18 remaining)
  const [invRows] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND status = "available"',
    [product1Id, warehouse1Id],
  );
  assert.equal(Number(invRows[0].quantity), 18);

  // 5. Idempotent check: completing sale again does not double-deduct stock
  const compRes = await agentCashier.post(`/api/v1/sales/${saleId}/complete`).send();
  assert.equal(compRes.status, 200);

  const [invRows2] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND status = "available"',
    [product1Id, warehouse1Id],
  );
  assert.equal(Number(invRows2[0].quantity), 18);

  // 6. Overpayment rejected
  const overpayRes = await agentCashier.post('/api/v1/payments').send({
    referenceType: 'sale',
    referenceId: saleId,
    amount: 50.00,
    paymentMethod: 'cash',
  });
  assert.equal(overpayRes.status, 409); // PAYMENT_ALREADY_PROCESSED
});

test('POS SALES INTEGRATION: partial and split payments settle sale incrementally', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);

  const [pSplit] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Split Med', 'SPLIT_${runId}', 50.00, 'otc', 'active')`,
    [org1Id],
  );
  const prodSplitId = pSplit.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [prodSplitId, unitBaseId]);

  const { batchId: splitBatchId } = await seedBatchStock({
    productId: prodSplitId,
    batchNumber: `SPLIT-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 10,
  });

  // Create sale: 2 pieces @ 50 = 100 ETB
  const saleRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    lines: [{ productId: prodSplitId, unitId: unitBaseId, quantity: 2 }],
  });
  const saleId = saleRes.body.data.sale.id;

  // Pay 60 ETB in cash (Partial)
  const p1Res = await agentCashier.post('/api/v1/payments').send({
    referenceType: 'sale',
    referenceId: saleId,
    amount: 60.00,
    paymentMethod: 'cash',
  });
  assert.equal(p1Res.status, 201);

  // Sale is now payment_pending and partially_paid; stock is NOT yet consumed
  const saleMid = (await agentCashier.get(`/api/v1/sales/${saleId}`)).body.data.sale;
  assert.equal(saleMid.status, 'payment_pending');
  assert.equal(saleMid.payment_status, 'partially_paid');
  assert.equal(Number(saleMid.paid_amount), 60.00);

  // Available stock in this batch is still 10
  const [invMid] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND batch_id = ? AND status = "available"',
    [prodSplitId, warehouse1Id, splitBatchId],
  );
  assert.equal(Number(invMid[0].quantity), 10);

  // Pay remaining 40 ETB via mobile money
  const p2Res = await agentCashier.post('/api/v1/payments').send({
    referenceType: 'sale',
    referenceId: saleId,
    amount: 40.00,
    paymentMethod: 'mobile_money',
    externalReference: 'MM-TXN-987654',
  });
  assert.equal(p2Res.status, 201);

  // Sale is now completed and fully paid, stock is consumed (10 - 2 = 8)
  const saleFinal = (await agentCashier.get(`/api/v1/sales/${saleId}`)).body.data.sale;
  assert.equal(saleFinal.status, 'completed');
  assert.equal(saleFinal.payment_status, 'paid');
  assert.equal(Number(saleFinal.paid_amount), 100.00);

  const [invFinal] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND batch_id = ? AND status = "available"',
    [prodSplitId, warehouse1Id, splitBatchId],
  );
  assert.equal(Number(invFinal[0].quantity), 8);
});

test('CUSTOMER CREDIT: authorized credit sale respects credit limits and blocks overdrafts', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);

  await seedBatchStock({
    productId: product1Id,
    batchNumber: `CRED-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 30,
  });

  // customerCreditLimitedId has limit = 500 ETB
  // 1. Create sale for 400 ETB (4 * 50 = 200, or 8 * 50 = 400 ETB)
  const s1Res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    customerId: customerCreditLimitedId,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 8 }],
  });
  const sale1Id = s1Res.body.data.sale.id;
  assert.equal(Number(s1Res.body.data.sale.total_amount), 400.00);

  // Authorize credit sale for 400 ETB -> Should succeed (400 <= 500 limit)
  const cred1Res = await agentCashier.post('/api/v1/receivables/credit-sale').send({
    saleId: sale1Id,
    customerId: customerCreditLimitedId,
    dueDate: '2026-12-31',
    notes: '30-day term',
  });
  assert.equal(cred1Res.status, 201);
  assert.equal(cred1Res.body.data.receivable.status, 'unpaid');
  assert.equal(Number(cred1Res.body.data.receivable.balance_amount), 400.00);

  // Check customer financial summary: outstanding balance = 400, available = 100
  const finSum1 = await agentCashier.get(`/api/v1/customers/${customerCreditLimitedId}/financial-summary`);
  assert.equal(finSum1.status, 200);
  assert.equal(Number(finSum1.body.data.financialSummary.outstandingBalance), 400.00);
  assert.equal(Number(finSum1.body.data.financialSummary.availableCredit), 100.00);

  // 2. Try another sale for 200 ETB -> 400 + 200 = 600 > 500 limit -> Rejected without override
  const s2Res = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    customerId: customerCreditLimitedId,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 4 }], // 200 ETB
  });
  const sale2Id = s2Res.body.data.sale.id;

  const credFail = await agentCashier.post('/api/v1/receivables/credit-sale').send({
    saleId: sale2Id,
    customerId: customerCreditLimitedId,
  });
  assert.equal(credFail.status, 409);
  assert.equal(credFail.body.error.code, 'CREDIT_LIMIT_EXCEEDED');

  // Admin with credit_sale.authorize can override
  const credOverride = await agentAdmin.post('/api/v1/receivables/credit-sale').send({
    saleId: sale2Id,
    customerId: customerCreditLimitedId,
    authorizedOverride: true,
  });
  assert.equal(credOverride.status, 201);
});

test('CUSTOMER CREDIT: inactive customer cannot make credit purchases', async () => {
  const sRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  const saleId = sRes.body.data.sale.id;

  const inactRes = await agentAdmin.post('/api/v1/receivables/credit-sale').send({
    saleId,
    customerId: customerInactiveId,
  });
  assert.equal(inactRes.status, 409);
  assert.equal(inactRes.body.error.code, 'CUSTOMER_INACTIVE');
});

test('ACCOUNTS RECEIVABLE: payments allocated to receivables reduce balance and clear obligation', async () => {
  // Find customerCreditLimitedId receivables
  const finSum = await agentCashier.get(`/api/v1/customers/${customerCreditLimitedId}/financial-summary`);
  const firstRec = finSum.body.data.receivables[0];
  assert.ok(firstRec);

  const initBal = Number(firstRec.balance_amount);
  const payAmt = 150.00;

  // Record payment against this receivable
  const payRecRes = await agentCashier.post('/api/v1/payments').send({
    referenceType: 'receivable',
    referenceId: firstRec.id,
    amount: payAmt,
    paymentMethod: 'bank_transfer',
    externalReference: 'CBE-TRANS-5544',
  });
  assert.equal(payRecRes.status, 201);

  // Check receivable balance updated
  const recAfter = (await agentCashier.get(`/api/v1/receivables/${firstRec.id}`)).body.data.receivable;
  assert.equal(Number(recAfter.balance_amount), initBal - payAmt);
  assert.equal(recAfter.status, 'partially_paid');
});

test('DISPENSING INTEGRATION: unverified dispensing rejects payment; verified dispensing consumes reserved stock upon payment', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);

  await seedBatchStock({
    productId: product2Id,
    batchNumber: `DISP-PAY-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 15,
  });

  // Create Patient & Doctor
  const [pat] = await pool.query(
    'INSERT INTO patients (organization_id, patient_number, first_name, last_name, gender, date_of_birth, status) VALUES (?, "P-999", "John", "Doe", "male", "1990-01-01", "active")',
    [org1Id],
  );
  const patientId = pat.insertId;

  const [doc] = await pool.query(
    'INSERT INTO prescribers (organization_id, prescriber_number, name, license_number, status) VALUES (?, "PR-999", "Dr. Test", "DOC-99", "active")',
    [org1Id],
  );
  const prescriberId = doc.insertId;

  // Create Prescription for 5 Amoxicillin (unit price = 100 -> total = 500 ETB)
  const [rxRes] = await pool.query(
    `INSERT INTO prescriptions (
       organization_id, branch_id, patient_id, prescriber_id, prescription_number,
       prescription_date, expiry_date, status, created_by
     ) VALUES (?, ?, ?, ?, 'RX-PAY-1', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 'validated', ?)`,
    [org1Id, branch1Id, patientId, prescriberId, adminUserId],
  );
  const rxId = rxRes.insertId;

  const [rxLineRes] = await pool.query(
    `INSERT INTO prescription_lines (
       prescription_id, product_id, unit_id, quantity_prescribed, quantity_dispensed,
       quantity_remaining, dosage, frequency, duration
     ) VALUES (?, ?, ?, 5, 0, 5, '500mg', 'TID', '5 days')`,
    [rxId, product2Id, unitBaseId],
  );
  const rxLineId = rxLineRes.insertId;

  // Create Dispensing
  const dispCreateRes = await agentAdmin.post('/api/v1/dispensings').send({
    prescriptionId: rxId,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rxLineId, quantityRequested: 5 }],
  });
  assert.equal(dispCreateRes.status, 201);
  const dispId = dispCreateRes.body.data.dispensing.id;

  // Allocate stock
  await agentAdmin.post(`/api/v1/dispensings/${dispId}/allocate`).send();

  // Try paying while in stock_allocated (unverified) -> Rejected!
  const unverifiedPay = await agentAdmin.post('/api/v1/payments').send({
    referenceType: 'dispensing',
    referenceId: dispId,
    amount: 500.00,
    paymentMethod: 'cash',
  });
  assert.equal(unverifiedPay.status, 409);
  assert.equal(unverifiedPay.body.error.code, 'PAYMENT_NOT_ELIGIBLE');

  // Verify dispensing as pharmacist -> moves to payment_pending
  const verifyRes = await agentAdmin.post(`/api/v1/dispensings/${dispId}/verify`).send({
    verificationNotes: 'Approved for dispensing',
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.dispensing.status, 'payment_pending');

  // Check inventory: 5 reserved
  const [resInv] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND status = "reserved"',
    [product2Id, warehouse1Id],
  );
  assert.equal(Number(resInv[0].quantity), 5);

  // Pay full 500 ETB
  const payDispRes = await agentAdmin.post('/api/v1/payments').send({
    referenceType: 'dispensing',
    referenceId: dispId,
    amount: 500.00,
    paymentMethod: 'cash',
  });
  assert.equal(payDispRes.status, 201);

  // Dispensing is now completed
  const dispFinal = (await agentAdmin.get(`/api/v1/dispensings/${dispId}`)).body.data.dispensing;
  assert.equal(dispFinal.status, 'completed');
  assert.equal(dispFinal.payment_status, 'paid');
  assert.equal(Number(dispFinal.paid_amount), 500.00);

  // Reserved inventory was physically consumed (0 reserved remaining)
  const [resInvAfter] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND status = "reserved"',
    [product2Id, warehouse1Id],
  );
  assert.equal(Number(resInvAfter[0]?.quantity || 0), 0);

  // Stock movement ledger row created with movement_type = 'dispensing' and negative quantity
  const [mvtRows] = await pool.query(
    'SELECT quantity_delta, movement_type, reference_type FROM stock_movements WHERE reference_type = "dispensing" AND reference_id = ?',
    [dispId],
  );
  assert.ok(mvtRows.length > 0);
  assert.equal(Number(mvtRows[0].quantity_delta), -5);

  // Prescription line quantity remains exactly 5 dispensed (no double update!)
  const [plRow] = await pool.query('SELECT quantity_dispensed, quantity_remaining FROM prescription_lines WHERE id = ?', [rxLineId]);
  assert.equal(Number(plRow[0].quantity_dispensed), 5);
  assert.equal(Number(plRow[0].quantity_remaining), 0);
});

test('PENDING PAYMENTS & VERIFICATION: electronic payment recorded as pending can be verified or cancelled', async () => {
  const pPending = await agentCashier.post('/api/v1/payments').send({
    amount: 250.00,
    paymentMethod: 'mobile_money',
    status: 'pending',
    externalReference: 'TELEBIRR-PENDING-001',
    notes: 'Awaiting customer SMS confirmation',
  });
  assert.equal(pPending.status, 201);
  const payId = pPending.body.data.payment.id;
  assert.equal(pPending.body.data.payment.status, 'pending');

  // Verify payment
  const verRes = await agentAdmin.post(`/api/v1/payments/${payId}/verify`).send({
    notes: 'Verified against merchant portal',
  });
  assert.equal(verRes.status, 200);
  assert.equal(verRes.body.data.payment.status, 'completed');
  assert.ok(verRes.body.data.payment.verified_by);

  // Second pending payment to test cancellation
  const pToCancel = await agentCashier.post('/api/v1/payments').send({
    amount: 150.00,
    paymentMethod: 'bank_transfer',
    status: 'pending',
  });
  const cancelId = pToCancel.body.data.payment.id;

  const cancelRes = await agentAdmin.post(`/api/v1/payments/${cancelId}/cancel`).send({
    reason: 'Customer transfer failed at ATM',
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.payment.status, 'cancelled');

  // Cannot cancel completed payment
  const badCancel = await agentAdmin.post(`/api/v1/payments/${payId}/cancel`).send({ reason: 'Try cancel' });
  assert.equal(badCancel.status, 409);
});

test('REFUNDS: authorized refund validates amounts, updates payment status, preserves financial ledger without inventory restock', async () => {
  // Create and fully pay a sale for 200 ETB
  const sRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 4 }],
  });
  const saleId = sRes.body.data.sale.id;

  const payRes = await agentCashier.post('/api/v1/payments').send({
    referenceType: 'sale',
    referenceId: saleId,
    amount: 200.00,
    paymentMethod: 'cash',
  });
  const paymentId = payRes.body.data.payment.id;

  // Available stock before refund
  const [invBefore] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND status = "available"',
    [product1Id, warehouse1Id],
  );
  const stockBefore = Number(invBefore[0].quantity);

  // 1. Refund without reason rejected (400)
  const noReason = await agentAdmin.post(`/api/v1/payments/${paymentId}/refund`).send({
    amount: 50.00,
    refundMethod: 'cash',
  });
  assert.equal(noReason.status, 400);

  // 2. Refund exceeding total paid rejected (400)
  const excessive = await agentAdmin.post(`/api/v1/payments/${paymentId}/refund`).send({
    amount: 250.00,
    reason: 'Wrong item given',
    refundMethod: 'cash',
  });
  assert.equal(excessive.status, 400);
  assert.equal(excessive.body.error.code, 'REFUND_EXCEEDS_PAID_AMOUNT');

  // 3. Partial refund: 80.00 ETB
  const partialRef = await agentAdmin.post(`/api/v1/payments/${paymentId}/refund`).send({
    amount: 80.00,
    reason: 'Customer returned unneeded OTC packs at checkout desk',
    refundMethod: 'cash',
  });
  assert.equal(partialRef.status, 200);
  assert.equal(partialRef.body.data.payment.status, 'partially_refunded');

  // Sale paid_amount is reduced (200 - 80 = 120), payment_status becomes 'partially_paid'
  const saleAfterPart = (await agentCashier.get(`/api/v1/sales/${saleId}`)).body.data.sale;
  assert.equal(Number(saleAfterPart.paid_amount), 120.00);
  assert.equal(saleAfterPart.payment_status, 'partially_paid');

  // 4. Full remaining refund: 120.00 ETB
  const fullRef = await agentAdmin.post(`/api/v1/payments/${paymentId}/refund`).send({
    amount: 120.00,
    reason: 'Remaining items refunded',
    refundMethod: 'cash',
  });
  assert.equal(fullRef.status, 200);
  assert.equal(fullRef.body.data.payment.status, 'refunded');

  // 5. Verification: stock was NOT automatically restocked
  const [invAfter] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND warehouse_id = ? AND status = "available"',
    [product1Id, warehouse1Id],
  );
  assert.equal(Number(invAfter[0].quantity), stockBefore);

  // 6. Payment receipt endpoint returns complete payment & refund history
  const receiptRes = await agentAdmin.get(`/api/v1/payments/${paymentId}/receipt`);
  assert.equal(receiptRes.status, 200);
  assert.ok(receiptRes.body.data.receipt.payment);
  assert.equal(receiptRes.body.data.receipt.refunds.length, 2);
});

test('SCOPE ISOLATION: user from Org 2 cannot view or pay Org 1 transactions', async () => {
  // Org 2 user attempts to pay Org 1 sale
  const sRes = await agentCashier.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 1 }],
  });
  const saleId = sRes.body.data.sale.id;

  const crossOrgPay = await agentOrg2.post('/api/v1/payments').send({
    referenceType: 'sale',
    referenceId: saleId,
    amount: 50.00,
    paymentMethod: 'cash',
  });
  assert.equal(crossOrgPay.status, 403);
});

after(async () => {
  if (pool) {
    try {
      await pool.query('DELETE FROM refunds');
      await pool.query('DELETE FROM payment_allocations');
      await pool.query('DELETE FROM customer_receivables');
      await pool.query('DELETE FROM payments');
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

