/**
 * Task 09 — Goods Receiving / Stock Intake tests.
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

let org1Id, branch1Id, warehouse1Id, location1Id;
let supplierId, productId, unitId, poId, poLineId, poLine2Id;

let agentAdmin;                     // full perms, org1 scope
let agentOrg2;                      // full perms, org2 scope
let agentWarehouse1;                // full perms, warehouse1 scope
let agentNoPerms;
let agentViewOnly;                  // goods_receipt.view only, org1 scope
let agentCreateView;                // view+create, org1 scope
let agentCompleteOnly;              // view+complete, org1 scope

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function roleWithPermissions(codes) {
  const code = 'GRR' + Math.random().toString(36).slice(2, 10);
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

async function scopeRowOrg(userId, orgId) {
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [userId, orgId]);
}
async function scopeRowWarehouse(userId, warehouseId) {
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, warehouse_id) VALUES (?, 'warehouse', ?)", [userId, warehouseId]);
}

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('DELETE FROM stock_count_line_events').catch(() => {});
  await pool.query('DELETE FROM stock_count_lines').catch(() => {});
  await pool.query('DELETE FROM stock_counts').catch(() => {});
  await pool.query('DELETE FROM stock_transfer_events').catch(() => {});
  await pool.query('DELETE FROM stock_transfer_batch_allocations').catch(() => {});
  await pool.query('DELETE FROM stock_transfer_lines').catch(() => {});
  await pool.query('DELETE FROM stock_transfers').catch(() => {});
  await pool.query('DELETE FROM supplier_return_lines').catch(() => {});
  await pool.query('DELETE FROM supplier_returns').catch(() => {});
  await pool.query('DELETE FROM goods_receipt_lines').catch(() => {});
  await pool.query('DELETE FROM goods_receipts').catch(() => {});
  await pool.query('DELETE FROM purchase_order_lines').catch(() => {});
  await pool.query('DELETE FROM purchase_orders').catch(() => {});
  await pool.query('DELETE FROM stock_movements').catch(() => {});
  await pool.query('DELETE FROM inventory').catch(() => {});
  await pool.query('DELETE FROM batches').catch(() => {});
  await pool.query('DELETE FROM product_units');
  await pool.query('DELETE FROM products');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM units');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM role_permissions');
  await pool.query('DELETE FROM roles');
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');

  const [o1] = await pool.query("INSERT INTO organizations (name, code) VALUES ('GR Org1', 'GRORG1')");
  org1Id = o1.insertId;
  const [o2] = await pool.query("INSERT INTO organizations (name, code) VALUES ('GR Org2', 'GRORG2')");
  const org2Id = o2.insertId;

  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)', [org1Id, 'Piassa', 'PB']);
  branch1Id = b1.insertId;
  const [w1] = await pool.query('INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)', [branch1Id, 'MainWH', 'MWH']);
  warehouse1Id = w1.insertId;
  const [l1] = await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, 'Shelf A', 'SA', 'normal')", [warehouse1Id]);
  location1Id = l1.insertId;

  const [b2] = await pool.query('INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)', [org2Id, 'Megenagna', 'MG']);
  const [w2] = await pool.query('INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)', [b2.insertId, 'WH2', 'WH2']);
  await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, 'Slot', 'SLOT2', 'normal')", [w2.insertId]);

  const [u1] = await pool.query('INSERT INTO units (organization_id, name, code) VALUES (?, ?, ?)', [org1Id, 'Box', 'BOX']);
  unitId = u1.insertId;
  const [p1] = await pool.query("INSERT INTO products (organization_id, code, name, prescription_classification, status) VALUES (?, 'P1', 'Paracetamol', 'otc', 'active')", [org1Id]);
  productId = p1.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_purchase_unit) VALUES (?, ?, 1)', [productId, unitId]);
  const [s1] = await pool.query("INSERT INTO suppliers (organization_id, code, name, status) VALUES (?, 'SUP1', 'Main Supplier', 'active')", [org1Id]);
  supplierId = s1.insertId;

  const [creatorUsr] = await pool.query(
    "INSERT INTO users (name, email, password_hash, status) VALUES ('GR SystemAdmin', 'gradmin-system@gr-test.local', ?, 'active')",
    [await bcrypt.hash(PASSWORD, 10)],
  );
  const createdById = creatorUsr.insertId;

  // Approved PO with two lines (10 boxes + 5 boxes)
  const [poRow] = await pool.query(
    "INSERT INTO purchase_orders (organization_id, branch_id, supplier_id, po_number, order_date, status, currency, total_amount, created_by) VALUES (?, ?, ?, 'PO-GR-1', '2026-10-08', 'approved', 'ETB', 0, ?)",
    [org1Id, branch1Id, supplierId, createdById],
  );
  poId = poRow.insertId;
  const [pol1] = await pool.query(
    'INSERT INTO purchase_order_lines (purchase_order_id, product_id, unit_id, ordered_quantity, unit_price, line_total) VALUES (?, ?, ?, 10, 100, 1000)',
    [poId, productId, unitId],
  );
  poLineId = pol1.insertId;
  const [pol2] = await pool.query(
    'INSERT INTO purchase_order_lines (purchase_order_id, product_id, unit_id, ordered_quantity, unit_price, line_total) VALUES (?, ?, ?, 5, 50, 250)',
    [poId, productId, unitId],
  );
  poLine2Id = pol2.insertId;

  const allAdminRole = await roleWithPermissions(['goods_receipt.view','goods_receipt.create','goods_receipt.update','goods_receipt.complete','goods_receipt.cancel','purchase_order.view','inventory.view','stock_movement.view']);
  const allAdmin = await insertUser('GR Admin', 'gradmin@gr-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [allAdmin, allAdminRole]);
  await scopeRowOrg(allAdmin, org1Id);

  const org2Admin = await insertUser('GR Org2', 'grorg2@gr-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [org2Admin, allAdminRole]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [org2Admin, org2Id]);

  const warehouseUserRole = await roleWithPermissions(['goods_receipt.view','goods_receipt.create','goods_receipt.update','goods_receipt.complete','goods_receipt.cancel']);
  const warehouseUser = await insertUser('GR WH', 'grwh@gr-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [warehouseUser, warehouseUserRole]);
  await scopeRowWarehouse(warehouseUser, warehouse1Id);

  await insertUser('GR NoPerms', 'grnoperms@gr-test.local');

  const viewRole = await roleWithPermissions(['goods_receipt.view']);
  const viewer = await insertUser('GR Viewer', 'grview@gr-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [viewer, viewRole]);
  await scopeRowOrg(viewer, org1Id);

  const createViewRole = await roleWithPermissions(['goods_receipt.view','goods_receipt.create']);
  const creator = await insertUser('GR Creator', 'grcreate@gr-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [creator, createViewRole]);
  await scopeRowOrg(creator, org1Id);

  const completeOnlyRole = await roleWithPermissions(['goods_receipt.view','goods_receipt.complete']);
  const completer = await insertUser('GR Completer', 'grcomplete@gr-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [completer, completeOnlyRole]);
  await scopeRowOrg(completer, org1Id);

  agentAdmin = await loginAgent('gradmin@gr-test.local');
  agentOrg2 = await loginAgent('grorg2@gr-test.local');
  agentWarehouse1 = await loginAgent('grwh@gr-test.local');
  agentNoPerms = await loginAgent('grnoperms@gr-test.local');
  agentViewOnly = await loginAgent('grview@gr-test.local');
  agentCreateView = await loginAgent('grcreate@gr-test.local');
  agentCompleteOnly = await loginAgent('grcomplete@gr-test.local');
});

after(async () => {
  try {
    if (pool) {
      await pool.query('DELETE FROM goods_receipt_lines');
      await pool.query('DELETE FROM goods_receipts');
      await pool.query('DELETE FROM purchase_order_lines');
      await pool.query('DELETE FROM purchase_orders');
      await pool.query('DELETE FROM stock_movements');
      await pool.query('DELETE FROM inventory');
      await pool.query('DELETE FROM batches');
      await pool.query('DELETE FROM product_units');
      await pool.query('DELETE FROM products');
      await pool.query('DELETE FROM suppliers');
      await pool.query('DELETE FROM units');
      await pool.query("DELETE FROM users WHERE email LIKE '%@gr-test.local'");
      await pool.query('DELETE FROM user_scopes');
      await pool.query('DELETE FROM user_roles');
      await pool.query('DELETE FROM role_permissions');
      await pool.query('DELETE FROM roles');
      await pool.query('DELETE FROM storage_locations');
      await pool.query('DELETE FROM warehouses');
      await pool.query('DELETE FROM branches');
      await pool.query('DELETE FROM organizations');
    }
  } finally {
    if (closePool) await closePool();
  }
});

// Helper for receipt creation
function draftPayload(partial = {}) {
  return {
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    purchaseOrderId: poId,
    receiptDate: '2026-10-08',
    notes: 'Initial receipt',
    lines: [
      {
        purchaseOrderLineId: poLineId,
        productId,
        unitId,
        orderedQuantity: 10,
        receivedQuantity: 10,
        batchNumber: 'BATCH-001',
        expiryDate: '2028-12-31',
        storageLocationId: location1Id,
      },
    ],
    ...partial,
  };
}

test('1 unauthenticated fails 401', async () => {
  assert.equal((await request(app).get('/api/v1/goods-receipts')).status, 401);
});

test('2 missing view → 403', async () => {
  assert.equal((await agentNoPerms.get('/api/v1/goods-receipts')).status, 403);
});

test('3 creating receipt without goods_receipt.create → 403', async () => {
  const res = await agentViewOnly.post('/api/v1/goods-receipts').send(draftPayload());
  assert.equal(res.status, 403);
});

test('4 draft receipt can be created against approved PO', async () => {
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  assert.equal(res.status, 201);
  assert.equal(res.body.data.goodsReceipt.status, 'draft');
  assert.equal(res.body.data.goodsReceipt.lines.length, 1);
});

test('5 cancelled/rejected/fully-received PO cannot create receipt', async () => {
  const cr = await pool.query("UPDATE purchase_orders SET status='cancelled' WHERE id=?", [poId]);
  assert.ok(cr);
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  assert.equal(res.status, 409);
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);
});

test('6 draft can be edited, then status starts receiving', async () => {
  const create = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  const id = create.body.data.goodsReceipt.id;
  const update = await agentAdmin.patch(`/api/v1/goods-receipts/${id}`).send({ notes: 'Updated', lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 5, batchNumber: 'BATCH-001', expiryDate: '2028-12-31', storageLocationId: location1Id }] });
  assert.equal(update.status, 200);
  const start = await agentAdmin.post(`/api/v1/goods-receipts/${id}/start`);
  assert.equal(start.body.data.goodsReceipt.status, 'receiving');
});

test('7 negative/zero received quantity rejected', async () => {
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 0, batchNumber: 'B0', expiryDate: '2028-01-01', storageLocationId: location1Id }] }));
  assert.equal(res.status, 400);
});

test('8 exceeding PO line remaining rejected', async () => {
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 11, batchNumber: 'B11', expiryDate: '2028-01-01', storageLocationId: location1Id }] }));
  assert.equal(res.status, 400);
});

test('9 expiry mismatch on existing batch rejected', async () => {
  // Create first receipt completed with BATCH-A; then try another with same batch but different expiry.
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);
  const create1 = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 3, batchNumber: 'BATCH-A', expiryDate: '2028-01-01', storageLocationId: location1Id }] }));
  assert.equal(create1.status, 201);
  await agentAdmin.post(`/api/v1/goods-receipts/${create1.body.data.goodsReceipt.id}/start`);
  await agentAdmin.post(`/api/v1/goods-receipts/${create1.body.data.goodsReceipt.id}/complete`);

  const create2 = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 4, batchNumber: 'BATCH-A', expiryDate: '2029-06-01', storageLocationId: location1Id }] }));
  assert.equal(create2.status, 201);
  await agentAdmin.post(`/api/v1/goods-receipts/${create2.body.data.goodsReceipt.id}/start`);
  const complete2 = await agentAdmin.post(`/api/v1/goods-receipts/${create2.body.data.goodsReceipt.id}/complete`);
  assert.equal(complete2.status, 400);
});

test('10 happy path: partial receipt updates inventory + movements + PO status', async () => {
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);

  const create = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 4, batchNumber: 'B-PART', expiryDate: '2028-01-01', storageLocationId: location1Id }] }));
  const grId = create.body.data.goodsReceipt.id;
  await agentAdmin.post(`/api/v1/goods-receipts/${grId}/start`);
  const complete = await agentAdmin.post(`/api/v1/goods-receipts/${grId}/complete`);
  assert.equal(complete.status, 200);
  assert.equal(complete.body.data.goodsReceipt.status, 'completed');

  const [inv] = await pool.query('SELECT quantity, status FROM inventory');
  assert.equal(Number(inv[0].quantity), 4);
  assert.equal(inv[0].status, 'available');

  const [mv] = await pool.query('SELECT movement_type, quantity_delta, reference_type, reference_id FROM stock_movements');
  assert.equal(mv[0].movement_type, 'purchase_receipt');
  assert.equal(Number(mv[0].quantity_delta), 4);
  assert.equal(mv[0].reference_type, 'goods_receipt');
  assert.equal(mv[0].reference_id, grId);

  const poAfter = (await pool.query('SELECT status FROM purchase_orders WHERE id = ?', [poId]))[0][0];
  assert.equal(poAfter.status, 'partially_received');
});

test('11 completing second receipt reaches fully_received', async () => {
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');

  const cre1 = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 7, batchNumber: 'B1', expiryDate: '2028-01-01', storageLocationId: location1Id }] }));
  const gr1 = cre1.body.data.goodsReceipt.id;
  await agentAdmin.post(`/api/v1/goods-receipts/${gr1}/start`);
  await agentAdmin.post(`/api/v1/goods-receipts/${gr1}/complete`);

  const cre2 = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({
    lines: [
      { purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 3, batchNumber: 'B2', expiryDate: '2028-01-01', storageLocationId: location1Id },
      { purchaseOrderLineId: poLine2Id, productId, unitId, orderedQuantity: 5, receivedQuantity: 5, batchNumber: 'B2', expiryDate: '2028-01-01', storageLocationId: location1Id },
    ],
  }));
  const gr2 = cre2.body.data.goodsReceipt.id;
  await agentAdmin.post(`/api/v1/goods-receipts/${gr2}/start`);
  await agentAdmin.post(`/api/v1/goods-receipts/${gr2}/complete`);

  const poAfter = (await pool.query('SELECT status FROM purchase_orders WHERE id = ?', [poId]))[0][0];
  assert.equal(poAfter.status, 'fully_received');
});

test('12 over-receipt across concurrent completions blocked', async () => {
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);

  const cre1 = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 7, batchNumber: 'B-A', expiryDate: '2028-01-01', storageLocationId: location1Id }] }));
  const grId1 = cre1.body.data.goodsReceipt.id;
  const cre2 = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ lines: [{ purchaseOrderLineId: poLineId, productId, unitId, orderedQuantity: 10, receivedQuantity: 7, batchNumber: 'B-B', expiryDate: '2028-06-01', storageLocationId: location1Id }] }));
  const grId2 = cre2.body.data.goodsReceipt.id;

  await Promise.all([
    agentAdmin.post(`/api/v1/goods-receipts/${grId1}/start`),
    agentAdmin.post(`/api/v1/goods-receipts/${grId2}/start`),
  ]);
  const [res1, res2] = await Promise.all([
    agentAdmin.post(`/api/v1/goods-receipts/${grId1}/complete`),
    agentAdmin.post(`/api/v1/goods-receipts/${grId2}/complete`),
  ]);
  const oks = [res1.status, res2.status].filter((s) => s === 200).length;
  const fails = [res1.status, res2.status].filter((s) => s !== 200).length;
  assert.equal(oks, 1);
  assert.equal(fails, 1);

  const sum = await pool.query("SELECT COALESCE(SUM(l.received_quantity),0) AS total FROM goods_receipt_lines l JOIN goods_receipts g ON g.id = l.goods_receipt_id WHERE l.purchase_order_line_id = ? AND g.status = 'completed'", [poLineId]);
  assert.ok(Number(sum[0][0].total) <= 10);
});

test('13 completing receipt rolls back PO status together when a line expiration problem occurs', async () => {
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);

  // Embed a bad goods_receipt_lines row (expiry_date mismatched against batch lookup)
  const create = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  const grId = create.body.data.goodsReceipt.id;
  // force the line expiration NULL so the complete-time batch lookup fails
  await pool.query('UPDATE goods_receipt_lines SET expiry_date = NULL WHERE goods_receipt_id = ?', [grId]);
  await agentAdmin.post(`/api/v1/goods-receipts/${grId}/start`);
  const complete = await agentAdmin.post(`/api/v1/goods-receipts/${grId}/complete`);
  assert.ok([400, 500].includes(complete.status));

  const invCount = (await pool.query('SELECT COUNT(*) AS n FROM inventory'))[0][0].n;
  const mvCount = (await pool.query('SELECT COUNT(*) AS n FROM stock_movements'))[0][0].n;
  const poAfter = (await pool.query('SELECT status FROM purchase_orders WHERE id=?', [poId]))[0][0];
  assert.equal(invCount, 0);
  assert.equal(mvCount, 0);
  assert.equal(poAfter.status, 'approved');
});

test('14 warehouse-scoped user can see only their warehouse rows', async () => {
  const list = await agentWarehouse1.get('/api/v1/goods-receipts');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.every((row) => row.warehouse_id === warehouse1Id));
});

test('15 create with invalid warehouse (cross-org) is rejected', async () => {
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ warehouseId: 999999 }));
  assert.ok([400, 404].includes(res.status));
});

test('16 PO from a different org is rejected', async () => {
  const [poOrg2] = await pool.query(
    "INSERT INTO purchase_orders (organization_id, branch_id, supplier_id, po_number, order_date, status, currency, total_amount, created_by) SELECT ?, ?, (SELECT id FROM suppliers LIMIT 1), 'PO-ORG2', '2026-10-08', 'approved', 'ETB', 0, ?",
    [(await pool.query("SELECT id FROM organizations WHERE code = 'GRORG2'"))[0][0].id, (await pool.query("SELECT id FROM branches LIMIT 1"))[0][0].id, (await pool.query("SELECT id FROM users WHERE email = 'gradmin-system@gr-test.local'"))[0][0].id],
  );
  const poOrg2Id = poOrg2.insertId;
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({ purchaseOrderId: poOrg2Id }));
  assert.equal(res.status, 400);
  await pool.query('DELETE FROM purchase_orders WHERE id = ?', [poOrg2Id]);
});

test('17 completed receipt cannot be edited', async () => {
  const create = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  const grId = create.body.data.goodsReceipt.id;
  await agentAdmin.post(`/api/v1/goods-receipts/${grId}/start`);
  await agentAdmin.post(`/api/v1/goods-receipts/${grId}/complete`);
  const edit = await agentAdmin.patch(`/api/v1/goods-receipts/${grId}`).send({ notes: 'too late' });
  assert.equal(edit.status, 409);
});

test('18 fully-received PO rejects new receipt', async () => {
  await pool.query("UPDATE purchase_orders SET status='fully_received' WHERE id=?", [poId]);
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  assert.equal(res.status, 409);
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);
});

test('19 list search works', async () => {
  const list = await agentAdmin.get('/api/v1/goods-receipts?search=Main Supplier');
  assert.ok(list.body.data.total >= 1);
});

test('20 PO status none-receiving status reports correctly on initial create', async () => {
  const res = await agentAdmin.get(`/api/v1/purchase-orders/${poId}`);
  assert.equal(res.status, 200);
});

test('21 past expiry date rejected', async () => {
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload({
    lines: [{
      purchaseOrderLineId: poLineId,
      productId,
      unitId,
      orderedQuantity: 10,
      receivedQuantity: 5,
      batchNumber: 'B-OLD',
      expiryDate: '2020-01-01',
      storageLocationId: location1Id,
    }],
  }));
  assert.equal(res.status, 400);
});

test('22 inactive warehouse is rejected', async () => {
  await pool.query("UPDATE warehouses SET status='inactive' WHERE id=?", [warehouse1Id]);
  const res = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  assert.equal(res.status, 409);
  await pool.query("UPDATE warehouses SET status='active' WHERE id=?", [warehouse1Id]);
});

test('23 discrepancy workflow records notes and allows resumption', async () => {
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query("UPDATE purchase_orders SET status='approved' WHERE id=?", [poId]);

  const create = await agentAdmin.post('/api/v1/goods-receipts').send(draftPayload());
  assert.equal(create.status, 201);
  const grId = create.body.data.goodsReceipt.id;
  await agentAdmin.post(`/api/v1/goods-receipts/${grId}/start`);
  const disc = await agentAdmin.post(`/api/v1/goods-receipts/${grId}/discrepancy`).send({ notes: 'Broken seals on 2 boxes' });
  assert.equal(disc.status, 200);
  assert.equal(disc.body.data.goodsReceipt.status, 'discrepancy');
  assert.ok(disc.body.data.goodsReceipt.notes.includes('Broken seals'));

  // Resume to receiving
  const resume = await agentAdmin.post(`/api/v1/goods-receipts/${grId}/start`);
  assert.equal(resume.status, 200);
  assert.equal(resume.body.data.goodsReceipt.status, 'receiving');

  // Cancel with reason
  const cancelled = await agentAdmin.post(`/api/v1/goods-receipts/${grId}/cancel`).send({ reason: 'Rejected by quality control' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.goodsReceipt.status, 'cancelled');
  assert.ok(cancelled.body.data.goodsReceipt.notes.includes('Rejected by quality control'));
});

