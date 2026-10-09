/**
 * Task 14 — Customer Returns, Supplier Returns & Returned-Stock Disposition Tests
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

const PASSWORD = 'Passw0rd!returns';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id;
let warehouse1Id;
let location1Id;
let unitBaseId;
let customer1Id, supplier1Id;
let product1Id, product2Id;

let agentAdmin;
let agentClerk;
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
  const code = 'ROLRET_' + Math.random().toString(36).slice(2, 9);
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

  // Clean any previous test data safely
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
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM purchase_order_lines');
  await pool.query('DELETE FROM purchase_orders');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM batches');

  // Organizations
  const [o1] = await pool.query(`INSERT INTO organizations (name, code, status) VALUES ('Return Org 1', 'RO1_${runTag}', 'active')`);
  org1Id = o1.insertId;
  const [o2] = await pool.query(`INSERT INTO organizations (name, code, status) VALUES ('Return Org 2', 'RO2_${runTag}', 'active')`);
  org2Id = o2.insertId;

  // Branches
  const [b1] = await pool.query(`INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Return Branch 1', 'RB1_${runTag}', 'active')`, [org1Id]);
  branch1Id = b1.insertId;
  const [b2] = await pool.query(`INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Return Branch 2', 'RB2_${runTag}', 'active')`, [org2Id]);
  branch2Id = b2.insertId;

  // Warehouses
  const [w1] = await pool.query(`INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Return Warehouse 1', 'RW1_${runTag}', 'active')`, [branch1Id]);
  warehouse1Id = w1.insertId;

  // Locations
  const [l1] = await pool.query(`INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, 'Return Shelf 1', 'RS1_${runTag}', 'active')`, [warehouse1Id]);
  location1Id = l1.insertId;

  // Units
  const [u1] = await pool.query(`INSERT INTO units (organization_id, name, code, status) VALUES (?, 'Piece', 'PCS_${runTag}', 'active')`, [org1Id]);
  unitBaseId = u1.insertId;

  // Products
  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Amoxicillin 250mg', 'AMX_${runTag}', 120.00, 'prescription', 'active')`,
    [org1Id],
  );
  product1Id = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product1Id, unitBaseId]);

  const [p2] = await pool.query(
    `INSERT INTO products (organization_id, name, code, selling_price, prescription_classification, status)
     VALUES (?, 'Paracetamol 500mg', 'PCM_${runTag}', 40.00, 'otc', 'active')`,
    [org1Id],
  );
  product2Id = p2.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [product2Id, unitBaseId]);

  // Customers & Suppliers
  const [c1] = await pool.query(
    `INSERT INTO customers (organization_id, name, telephone, status, credit_limit)
     VALUES (?, 'Test Patient Customer', '+251911000111', 'active', 5000.00)`,
    [org1Id],
  );
  customer1Id = c1.insertId;

  const [s1] = await pool.query(
    `INSERT INTO suppliers (organization_id, name, code, status)
     VALUES (?, 'Apex Pharmaceuticals', 'APEX_${runTag}', 'active')`,
    [org1Id],
  );
  supplier1Id = s1.insertId;

  // Users
  const uAdminId = await insertUser('Admin User', `admin_ret_${runTag}@test.local`);
  adminUserId = uAdminId;
  const uClerkId = await insertUser('Clerk User', `clerk_ret_${runTag}@test.local`);
  const uNoPermsId = await insertUser('NoPerms User', `noperms_ret_${runTag}@test.local`);
  const uOrg2Id = await insertUser('Org2 User', `org2_ret_${runTag}@test.local`);

  // Scopes
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdminId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [uClerkId, branch1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uClerkId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uNoPermsId, org1Id]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uOrg2Id, org2Id]);

  // Roles & Permissions
  await addRoleWithPerms(uAdminId, [
    'customer_return.view', 'customer_return.create', 'customer_return.inspect',
    'customer_return.approve', 'customer_return.reject', 'customer_return.complete', 'customer_return.cancel',
    'supplier_return.view', 'supplier_return.create', 'supplier_return.approve',
    'supplier_return.complete', 'supplier_return.cancel',
    'sale.view', 'sale.create', 'sale.confirm', 'sale.complete',
    'payment.view', 'payment.create', 'payment.refund',
    'receivable.view', 'receivable.manage', 'credit_sale.authorize',
    'goods_receipt.view',
  ]);

  await addRoleWithPerms(uClerkId, [
    'customer_return.view', 'customer_return.create', 'customer_return.inspect',
    'supplier_return.view', 'supplier_return.create',
  ]);

  agentAdmin = await loginAgent(`admin_ret_${runTag}@test.local`);
  agentClerk = await loginAgent(`clerk_ret_${runTag}@test.local`);
  agentNoPerms = await loginAgent(`noperms_ret_${runTag}@test.local`);
  agentOrg2 = await loginAgent(`org2_ret_${runTag}@test.local`);
});

// Helper to create a completed POS sale
async function createCompletedSale({ quantity = 10, unitPrice = 120, payAmount = 1200, isCredit = false }) {
  const stock = await seedBatchStock({
    productId: product1Id,
    batchNumber: 'BATCH-SALE-' + Math.random().toString(36).slice(2, 7),
    expiryDate: '2028-12-31',
    quantity: 100,
  });

  const saleRes = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    customerId: customer1Id,
    saleType: isCredit ? 'credit' : 'standard',
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity, unitPrice }],
  });
  assert.equal(saleRes.status, 201, 'sale creation failed');
  const saleId = saleRes.body.data.sale.id;

  const confRes = await agentAdmin.post(`/api/v1/sales/${saleId}/confirm`);
  assert.equal(confRes.status, 200, 'sale confirmation failed');

  if (isCredit) {
    const credRes = await agentAdmin.post('/api/v1/receivables/credit-sale').send({
      saleId,
      customerId: customer1Id,
      dueDate: '2028-12-31',
    });
    assert.equal(credRes.status, 201, 'credit sale creation failed');
  } else {
    // Complete paid sale
    const compRes = await agentAdmin.post(`/api/v1/sales/${saleId}/complete`);
    assert.equal(compRes.status, 200, 'sale completion failed');

    if (payAmount > 0) {
      const payRes = await agentAdmin.post('/api/v1/payments').send({
        organizationId: org1Id,
        branchId: branch1Id,
        customerId: customer1Id,
        paymentMethod: 'cash',
        amount: payAmount,
        allocations: [{ referenceType: 'sale', referenceId: saleId, amount: payAmount }],
      });
      assert.equal(payRes.status, 201, 'payment creation failed');
    }
  }

  // Get sale details with lines and allocations
  const detailRes = await agentAdmin.get(`/api/v1/sales/${saleId}`);
  const saleLine = detailRes.body.data.sale.lines[0];
  const [allocs] = await pool.query(
    'SELECT batch_id, storage_location_id FROM sale_batch_allocations WHERE sale_line_id = ? LIMIT 1',
    [saleLine.id],
  );
  const allocatedBatchId = allocs[0]?.batch_id || stock.batchId;

  return {
    saleId,
    sale: detailRes.body.data.sale,
    saleLineId: saleLine.id,
    batchId: allocatedBatchId,
    unitPrice,
    quantity,
  };
}

// Helper to create a completed Goods Receipt
async function createCompletedGoodsReceipt({ quantity = 20, unitPrice = 80 }) {
  const [poRes] = await pool.query(
    `INSERT INTO purchase_orders (
       organization_id, branch_id, supplier_id, po_number, order_date, status, total_amount, created_by
     ) VALUES (?, ?, ?, ?, CURDATE(), 'approved', ?, ?)`,
    [org1Id, branch1Id, supplier1Id, `PO-${Date.now()}`, quantity * unitPrice, adminUserId],
  );
  const poId = poRes.insertId;

  const [polRes] = await pool.query(
    `INSERT INTO purchase_order_lines (
       purchase_order_id, product_id, unit_id, ordered_quantity, unit_price, line_total
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [poId, product2Id, unitBaseId, quantity, unitPrice, quantity * unitPrice],
  );
  const polId = polRes.insertId;

  const batchNumber = 'BATCH-GR-' + Math.random().toString(36).slice(2, 7);
  const stock = await seedBatchStock({
    productId: product2Id,
    batchNumber,
    expiryDate: '2028-06-30',
    quantity,
  });

  const [grRes] = await pool.query(
    `INSERT INTO goods_receipts (
       organization_id, branch_id, warehouse_id, purchase_order_id, receipt_number, receipt_date, status, received_by
     ) VALUES (?, ?, ?, ?, ?, CURDATE(), 'completed', ?)`,
    [org1Id, branch1Id, warehouse1Id, poId, `GR-${Date.now()}`, adminUserId],
  );
  const grId = grRes.insertId;

  const [grlRes] = await pool.query(
    `INSERT INTO goods_receipt_lines (
       goods_receipt_id, purchase_order_line_id, product_id, unit_id,
       ordered_quantity, received_quantity, batch_number, expiry_date, storage_location_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, '2028-06-30', ?)`,
    [grId, polId, product2Id, unitBaseId, quantity, quantity, batchNumber, location1Id],
  );
  const grlId = grlRes.insertId;

  return {
    goodsReceiptId: grId,
    goodsReceiptLineId: grlId,
    batchId: stock.batchId,
    batchNumber,
    quantity,
    unitPrice,
  };
}

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
      await pool.query('DELETE FROM sale_batch_allocations');
      await pool.query('DELETE FROM sale_lines');
      await pool.query('DELETE FROM sales');
      await pool.query('DELETE FROM goods_receipt_lines');
      await pool.query('DELETE FROM goods_receipts');
      await pool.query('DELETE FROM purchase_order_lines');
      await pool.query('DELETE FROM purchase_orders');
      await pool.query('DELETE FROM stock_movements');
      await pool.query('DELETE FROM inventory');
      await pool.query('DELETE FROM batches');
    } catch (e) {
      // ignore teardown error
    }
  }
  if (closePool) await closePool();
});

/* ========================================================================== */
/*                           CUSTOMER RETURNS TESTS                           */
/* ========================================================================== */

test('PERMISSIONS & SCOPE: Customer returns access control', async () => {
  const unauthRes = await request(app).get('/api/v1/customer-returns');
  assert.equal(unauthRes.status, 401);

  const noPermRes = await agentNoPerms.get('/api/v1/customer-returns');
  assert.equal(noPermRes.status, 403);

  const listRes = await agentAdmin.get('/api/v1/customer-returns');
  assert.equal(listRes.status, 200);
});

test('CUSTOMER RETURN: Validation gates for non-existent or ineligible sale', async () => {
  // Non-existent sale
  const invalidSaleRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId: 999999,
    reason: 'Defective item',
    lines: [{ saleLineId: 1, batchId: 1, quantity: 1 }],
  });
  assert.equal(invalidSaleRes.status, 404);

  // Incomplete sale (draft sale cannot be returned)
  const draftSaleRes = await agentAdmin.post('/api/v1/sales').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    customerId: customer1Id,
    saleType: 'standard',
    lines: [{ productId: product1Id, unitId: unitBaseId, quantity: 2, unitPrice: 120 }],
  });
  const draftSaleId = draftSaleRes.body.data.sale.id;

  const returnDraftRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId: draftSaleId,
    reason: 'Trying to return draft sale',
    lines: [{ saleLineId: draftSaleRes.body.data.sale.lines[0].id, batchId: 1, quantity: 1 }],
  });
  assert.equal(returnDraftRes.status, 409);
  assert.equal(returnDraftRes.body.error.code, 'SALE_NOT_ELIGIBLE');
});

test('CUSTOMER RETURN: Product and quantity validations (cannot exceed sale quantity)', async () => {
  const { saleId, saleLineId, batchId } = await createCompletedSale({ quantity: 5, unitPrice: 120 });

  // Missing lines
  const noLinesRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'No lines provided',
    lines: [],
  });
  assert.equal(noLinesRes.status, 400);

  // Negative quantity
  const negQtyRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'Negative quantity test',
    lines: [{ saleLineId, batchId, quantity: -2 }],
  });
  assert.equal(negQtyRes.status, 400);

  // Quantity exceeding sold quantity (attempt 10 when only 5 sold)
  const overQtyRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'Over return test',
    lines: [{ saleLineId, batchId, quantity: 10 }],
  });
  assert.equal(overQtyRes.status, 400);
  assert.equal(overQtyRes.body.error.code, 'RETURN_QUANTITY_EXCEEDED');
});

test('CUSTOMER RETURN: End-to-end lifecycle (Create -> Inspect -> Approve -> Complete with Refund & Stock Disposition)', async () => {
  const { saleId, saleLineId, batchId } = await createCompletedSale({ quantity: 4, unitPrice: 120, payAmount: 480 });

  // 1. Check eligibility endpoint
  const eligRes = await agentAdmin.get(`/api/v1/customer-returns/sale-eligibility/${saleId}`);
  assert.equal(eligRes.status, 200);
  assert.equal(eligRes.body.data.lines[0].remaining_returnable_quantity, 4);

  // 2. Create customer return
  const createRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'Patient experienced mild allergy, sealed pack remaining',
    lines: [{ saleLineId, batchId, quantity: 2, storageLocationId: location1Id }],
    submit: true, // submit right away
  });
  assert.equal(createRes.status, 201);
  const retId = createRes.body.data.customerReturn.id;
  assert.equal(createRes.body.data.customerReturn.status, 'submitted');
  assert.equal(Number(createRes.body.data.customerReturn.refund_amount), 240);

  const retLineId = createRes.body.data.customerReturn.lines[0].id;

  // 3. Inspect return (pharmacist inspects medicine condition and sets disposition)
  const inspectRes = await agentAdmin.post(`/api/v1/customer-returns/${retId}/inspect`).send({
    lines: [
      {
        id: retLineId,
        conditionState: 'sealed_intact',
        disposition: 'quarantine',
        dispositionNotes: 'Verified blister intact. Place in quarantine for supervisor review.',
      },
    ],
    notes: 'Inspection passed blister check',
  });
  assert.equal(inspectRes.status, 200);
  assert.equal(inspectRes.body.data.customerReturn.status, 'pending_inspection');

  // 4. Approve return
  const approveRes = await agentAdmin.post(`/api/v1/customer-returns/${retId}/approve`).send({
    outcome: 'refund',
    refundAmount: 240,
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.data.customerReturn.status, 'approved');

  // Verify stock position before completion: quarantined stock should be 0
  const [preInv] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND batch_id = ? AND status = "quarantined"',
    [product1Id, batchId],
  );
  const preQuarantinedQty = Number(preInv[0]?.quantity || 0);

  // 5. Complete return
  const compRes = await agentAdmin.post(`/api/v1/customer-returns/${retId}/complete`);
  assert.equal(compRes.status, 200);
  assert.equal(compRes.body.data.customerReturn.status, 'completed');
  assert.ok(compRes.body.data.customerReturn.refund_id, 'Refund ID must be linked to return');

  // Verify stock mutation: quarantined inventory should have increased by returned quantity (2)
  const [postInv] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND batch_id = ? AND status = "quarantined"',
    [product1Id, batchId],
  );
  const postQuarantinedQty = Number(postInv[0]?.quantity || 0);
  assert.equal(postQuarantinedQty, preQuarantinedQty + 2);

  // Verify signed positive stock_movements ledger entry
  const [movRows] = await pool.query(
    `SELECT * FROM stock_movements
     WHERE reference_type = 'customer_return' AND reference_id = ? AND movement_type = 'customer_return'`,
    [retId],
  );
  assert.equal(movRows.length, 1);
  assert.equal(Number(movRows[0].quantity_delta), 2);

  // 6. Test Idempotency: completing already completed return does not fail or duplicate refund
  const repeatCompRes = await agentAdmin.post(`/api/v1/customer-returns/${retId}/complete`);
  assert.equal(repeatCompRes.status, 200);
  assert.equal(repeatCompRes.body.data.customerReturn.status, 'completed');

  // Verify no duplicate stock movements
  const [movRowsAfter] = await pool.query(
    `SELECT * FROM stock_movements
     WHERE reference_type = 'customer_return' AND reference_id = ? AND movement_type = 'customer_return'`,
    [retId],
  );
  assert.equal(movRowsAfter.length, 1);
});

test('CUSTOMER RETURN: Safety restriction — unsealed medicine cannot be returned to available stock', async () => {
  const { saleId, saleLineId, batchId } = await createCompletedSale({ quantity: 2, unitPrice: 120 });

  const createRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'Opened bottle returned',
    lines: [{ saleLineId, batchId, quantity: 1 }],
    submit: true,
  });
  const retId = createRes.body.data.customerReturn.id;
  const lineId = createRes.body.data.customerReturn.lines[0].id;

  // Attempting to return an opened product to saleable available stock must be rejected!
  const badInspectRes = await agentAdmin.post(`/api/v1/customer-returns/${retId}/inspect`).send({
    lines: [
      {
        id: lineId,
        conditionState: 'opened',
        disposition: 'return_to_stock',
        dispositionNotes: 'Attempting to restock opened medicine',
      },
    ],
  });
  assert.equal(badInspectRes.status, 400);
  assert.equal(badInspectRes.body.error.code, 'CANNOT_RESTOCK_UNSEALED');
});

test('CUSTOMER RETURN: Credit sale handling — reduces customer receivable balance rather than paying cash', async () => {
  const { saleId, saleLineId, batchId } = await createCompletedSale({
    quantity: 5,
    unitPrice: 120,
    isCredit: true,
  });

  // Verify receivable exists with balance 600
  const [recBefore] = await pool.query(
    'SELECT balance_amount, total_amount FROM customer_receivables WHERE reference_type = "sale" AND reference_id = ?',
    [saleId],
  );
  assert.equal(Number(recBefore[0].balance_amount), 600);

  // Return 2 items (value 240)
  const createRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'Credit customer returned 2 units',
    lines: [{ saleLineId, batchId, quantity: 2 }],
    submit: true,
  });
  const retId = createRes.body.data.customerReturn.id;
  const lineId = createRes.body.data.customerReturn.lines[0].id;

  await agentAdmin.post(`/api/v1/customer-returns/${retId}/inspect`).send({
    lines: [{ id: lineId, conditionState: 'sealed_intact', disposition: 'quarantine' }],
  });
  await agentAdmin.post(`/api/v1/customer-returns/${retId}/approve`).send({
    outcome: 'refund',
    refundAmount: 240,
  });
  const compRes = await agentAdmin.post(`/api/v1/customer-returns/${retId}/complete`);
  assert.equal(compRes.status, 200);

  // Verify no cash refund record was created because the sale was unpaid on credit
  assert.equal(compRes.body.data.customerReturn.refund_id, null);

  // Verify the receivable balance was reduced by 240 (from 600 to 360)
  const [recAfter] = await pool.query(
    'SELECT balance_amount, total_amount FROM customer_receivables WHERE reference_type = "sale" AND reference_id = ?',
    [saleId],
  );
  assert.equal(Number(recAfter[0].balance_amount), 360);
  assert.equal(Number(recAfter[0].total_amount), 360);
});

test('CUSTOMER RETURN: Out-of-scope branch user cannot access another branch return', async () => {
  const { saleId, saleLineId, batchId } = await createCompletedSale({ quantity: 2, unitPrice: 120 });
  const createRes = await agentAdmin.post('/api/v1/customer-returns').send({
    saleId,
    reason: 'Branch scope test',
    lines: [{ saleLineId, batchId, quantity: 1 }],
  });
  const retId = createRes.body.data.customerReturn.id;

  // Agent from Org2 should be forbidden from accessing Org1's return
  const org2Res = await agentOrg2.get(`/api/v1/customer-returns/${retId}`);
  assert.equal(org2Res.status, 403);
});

/* ========================================================================== */
/*                           SUPPLIER RETURNS TESTS                           */
/* ========================================================================== */

test('PERMISSIONS & SCOPE: Supplier returns access control', async () => {
  const unauthRes = await request(app).get('/api/v1/supplier-returns');
  assert.equal(unauthRes.status, 401);

  const noPermRes = await agentNoPerms.get('/api/v1/supplier-returns');
  assert.equal(noPermRes.status, 403);

  const listRes = await agentAdmin.get('/api/v1/supplier-returns');
  assert.equal(listRes.status, 200);
});

test('SUPPLIER RETURN: Validation gates for non-existent or over-quantity receipt', async () => {
  // Non-existent goods receipt
  const badGrRes = await agentAdmin.post('/api/v1/supplier-returns').send({
    goodsReceiptId: 999999,
    reason: 'Non-existent receipt test',
    lines: [{ goodsReceiptLineId: 1, quantity: 1 }],
  });
  assert.equal(badGrRes.status, 404);

  const { goodsReceiptId, goodsReceiptLineId, batchId } = await createCompletedGoodsReceipt({
    quantity: 5,
    unitPrice: 80,
  });

  // Quantity greater than received (attempting to return 10 when 5 was received)
  const overQtyRes = await agentAdmin.post('/api/v1/supplier-returns').send({
    goodsReceiptId,
    reason: 'Over receipt quantity test',
    lines: [{ goodsReceiptLineId, batchId, quantity: 10 }],
  });
  assert.equal(overQtyRes.status, 400);
  assert.equal(overQtyRes.body.error.code, 'RETURN_QUANTITY_EXCEEDED');
});

test('SUPPLIER RETURN: End-to-end lifecycle (Create -> Submit -> Approve -> Complete with Stock Deduction)', async () => {
  const { goodsReceiptId, goodsReceiptLineId, batchId } = await createCompletedGoodsReceipt({
    quantity: 10,
    unitPrice: 80,
  });

  // Check receipt eligibility
  const eligRes = await agentAdmin.get(`/api/v1/supplier-returns/receipt-eligibility/${goodsReceiptId}`);
  assert.equal(eligRes.status, 200);
  assert.equal(eligRes.body.data.lines[0].remaining_returnable_quantity, 10);

  // 1. Create supplier return order for 4 units
  const createRes = await agentAdmin.post('/api/v1/supplier-returns').send({
    goodsReceiptId,
    reason: 'Near-expiry delivery from supplier batch',
    lines: [{ goodsReceiptLineId, batchId, quantity: 4, reason: 'Near-expiry packaging' }],
  });
  assert.equal(createRes.status, 201);
  const srId = createRes.body.data.supplierReturn.id;
  assert.equal(createRes.body.data.supplierReturn.status, 'draft');
  assert.equal(Number(createRes.body.data.supplierReturn.total_amount), 320);

  // 2. Submit return
  const submitRes = await agentAdmin.post(`/api/v1/supplier-returns/${srId}/submit`);
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.data.supplierReturn.status, 'submitted');

  // 3. Approve return
  const approveRes = await agentAdmin.post(`/api/v1/supplier-returns/${srId}/approve`);
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.data.supplierReturn.status, 'approved');

  // Check inventory before completion
  const [invPre] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND batch_id = ? AND status = "available"',
    [product2Id, batchId],
  );
  const qtyPre = Number(invPre[0]?.quantity || 0);

  // 4. Complete supplier return (dispatch goods to supplier)
  const compRes = await agentAdmin.post(`/api/v1/supplier-returns/${srId}/complete`);
  assert.equal(compRes.status, 200);
  assert.equal(compRes.body.data.supplierReturn.status, 'completed');

  // Check inventory after completion: stock should have decreased by 4
  const [invPost] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND batch_id = ? AND status = "available"',
    [product2Id, batchId],
  );
  const qtyPost = Number(invPost[0]?.quantity || 0);
  assert.equal(qtyPost, qtyPre - 4);

  // Check stock_movements ledger entry (signed negative delta)
  const [movRows] = await pool.query(
    `SELECT * FROM stock_movements
     WHERE reference_type = 'supplier_return' AND reference_id = ? AND movement_type = 'supplier_return'`,
    [srId],
  );
  assert.equal(movRows.length, 1);
  assert.equal(Number(movRows[0].quantity_delta), -4);

  // 5. Test idempotency
  const repeatCompRes = await agentAdmin.post(`/api/v1/supplier-returns/${srId}/complete`);
  assert.equal(repeatCompRes.status, 200);
  assert.equal(repeatCompRes.body.data.supplierReturn.status, 'completed');

  // Verify stock was not deducted a second time
  const [invPostRepeat] = await pool.query(
    'SELECT quantity FROM inventory WHERE product_id = ? AND batch_id = ? AND status = "available"',
    [product2Id, batchId],
  );
  assert.equal(Number(invPostRepeat[0]?.quantity || 0), qtyPost);
});

test('SUPPLIER RETURN: Insufficient warehouse stock prevents supplier return dispatch', async () => {
  const { goodsReceiptId, goodsReceiptLineId, batchId } = await createCompletedGoodsReceipt({
    quantity: 10,
    unitPrice: 80,
  });

  // Create return order for 5 units
  const createRes = await agentAdmin.post('/api/v1/supplier-returns').send({
    goodsReceiptId,
    reason: 'Stock shortage test',
    lines: [{ goodsReceiptLineId, batchId, quantity: 5 }],
  });
  const srId = createRes.body.data.supplierReturn.id;
  await agentAdmin.post(`/api/v1/supplier-returns/${srId}/submit`);
  await agentAdmin.post(`/api/v1/supplier-returns/${srId}/approve`);

  // Artificially deplete inventory to 2 units (less than the 5 required to dispatch)
  await pool.query(
    'UPDATE inventory SET quantity = 2 WHERE product_id = ? AND batch_id = ?',
    [product2Id, batchId],
  );

  // Completion must fail with INSUFFICIENT_STOCK
  const compRes = await agentAdmin.post(`/api/v1/supplier-returns/${srId}/complete`);
  assert.equal(compRes.status, 409);
  assert.equal(compRes.body.error.code, 'INSUFFICIENT_STOCK');
});
