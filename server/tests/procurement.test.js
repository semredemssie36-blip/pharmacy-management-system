/**
 * Task 08 — Procurement / Purchase Orders tests.
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

let org1Id, org2Id;
let branch1Id, warehouse1Id, location1Id;
let branch2Id, warehouse2Id, location2Id;
let supplier1Id;
let supplierInactiveId;
let agentAdmin;       // org1 scope (full perms)
let agentOrg2;       // org2 scope (full perms)
let agentBranch;     // branch1 scope (full perms)
let agentNoPerms;
let agentViewOnlyPO; // purchase_order.view only + org1 scope
let agentCreateOnlyPO; // purchase_order.create only + org1 scope
let agentApprover;   // purchase_order.approve/view + org1 scope
let productId, inactiveProductId, unitId;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function roleWithPermissions(codes) {
  const code = 'R' + Math.random().toString(36).slice(2, 10);
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
async function scopeRowBranch(userId, branchId) {
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [userId, branchId]);
}

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('DELETE FROM purchase_order_lines');
  await pool.query('DELETE FROM purchase_orders');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM product_relationships');
  await pool.query('DELETE FROM product_unit_conversions');
  await pool.query('DELETE FROM product_units');
  await pool.query('DELETE FROM product_active_ingredients');
  await pool.query('DELETE FROM products');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM customers');
  await pool.query('DELETE FROM manufacturers');
  await pool.query('DELETE FROM therapeutic_categories');
  await pool.query('DELETE FROM categories');
  await pool.query('DELETE FROM routes');
  await pool.query('DELETE FROM dosage_forms');
  await pool.query('DELETE FROM generics');
  await pool.query('DELETE FROM brands');
  await pool.query('DELETE FROM active_ingredients');
  await pool.query('DELETE FROM units');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM role_permissions');
  await pool.query('DELETE FROM roles');
  await pool.query("DELETE FROM users WHERE email LIKE '%@po-test.local'");
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');

  const [o1] = await pool.query("INSERT INTO organizations (name, code) VALUES ('PO Org One', 'POORG1')");
  const [o2] = await pool.query("INSERT INTO organizations (name, code) VALUES ('PO Org Two', 'POORG2')");
  org1Id = o1.insertId;
  org2Id = o2.insertId;

  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)', [org1Id, 'Piassa Branch', 'PB']);
  const [b2] = await pool.query('INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)', [org2Id, 'Megenagna Branch', 'MB']);
  branch1Id = b1.insertId;
  branch2Id = b2.insertId;

  const [w1] = await pool.query('INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)', [branch1Id, 'WH1', 'WH1']);
  const [w2] = await pool.query('INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)', [branch2Id, 'WH2', 'WH2']);
  warehouse1Id = w1.insertId;
  warehouse2Id = w2.insertId;

  const [l1] = await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, 'Slot A', 'SA', 'normal')", [warehouse1Id]);
  const [l2] = await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, 'Slot A2', 'SA2', 'normal')", [warehouse2Id]);
  location1Id = l1.insertId;
  location2Id = l2.insertId;

  const [uRow] = await pool.query(`INSERT INTO units (organization_id, name, code) VALUES (?, 'Box', 'BOX')`, [org1Id]);
  unitId = uRow.insertId;

  const [sRow] = await pool.query("INSERT INTO products (organization_id, code, name, prescription_classification, status) VALUES (?, 'AAA1', 'Amoxicillin 500mg', 'prescription', 'active')", [org1Id]);
  productId = sRow.insertId;

  const [iaRow] = await pool.query("INSERT INTO products (organization_id, code, name, prescription_classification, status) VALUES (?, 'INA1', 'Inactive Product', 'otc', 'inactive')", [org1Id]);
  inactiveProductId = iaRow.insertId;

  await pool.query('INSERT INTO product_units (product_id, unit_id, is_purchase_unit) VALUES (?, ?, 1)', [productId, unitId]);

  const [supA] = await pool.query("INSERT INTO suppliers (organization_id, code, name, status) VALUES (?, 'SUP1', 'Local Supplier', 'active')", [org1Id]);
  supplier1Id = supA.insertId;

  const [supB] = await pool.query("INSERT INTO suppliers (organization_id, code, name, status) VALUES (?, 'SUP2', 'Old Supplier', 'inactive')", [org1Id]);
  supplierInactiveId = supB.insertId;

  const allPermRoleId = await roleWithPermissions(['purchase_order.view','purchase_order.create','purchase_order.update','purchase_order.submit','purchase_order.cancel','purchase_order.approve']);

  const adminUser = await insertUser('PO Org1 Admin', 'poadmin@po-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminUser, allPermRoleId]);
  await scopeRowOrg(adminUser, org1Id);

  const org2User = await insertUser('PO Org2 Admin', 'poorg2@po-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [org2User, allPermRoleId]);
  await scopeRowOrg(org2User, org2Id);

  const branchUser = await insertUser('PO Branch', 'pobranch@po-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [branchUser, allPermRoleId]);
  await scopeRowBranch(branchUser, branch1Id);

  const noPermUser = await insertUser('PO NoPerms', 'ponoperm@po-test.local');

  const viewRoleId = await roleWithPermissions(['purchase_order.view']);
  const viewUser = await insertUser('PO ViewOnly', 'poview@po-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [viewUser, viewRoleId]);
  await scopeRowOrg(viewUser, org1Id);

  const createRoleId = await roleWithPermissions(['purchase_order.create']);
  const createUser = await insertUser('PO CreateOnly', 'pocreate@po-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [createUser, createRoleId]);
  await scopeRowOrg(createUser, org1Id);

  const approveRoleId = await roleWithPermissions(['purchase_order.approve', 'purchase_order.view']);
  const approver = await insertUser('PO Approver', 'poapprover@po-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [approver, approveRoleId]);
  await scopeRowOrg(approver, org1Id);

  agentAdmin = await loginAgent('poadmin@po-test.local');
  agentOrg2 = await loginAgent('poorg2@po-test.local');
  agentBranch = await loginAgent('pobranch@po-test.local');
  agentNoPerms = await loginAgent('ponoperm@po-test.local');
  agentViewOnlyPO = await loginAgent('poview@po-test.local');
  agentCreateOnlyPO = await loginAgent('pocreate@po-test.local');
  agentApprover = await loginAgent('poapprover@po-test.local');
});

after(async () => {
  try {
    if (pool) {
      await pool.query('DELETE FROM purchase_order_lines');
      await pool.query('DELETE FROM purchase_orders');
      await pool.query('DELETE FROM products');
      await pool.query('DELETE FROM suppliers');
      await pool.query('DELETE FROM units');
      await pool.query("DELETE FROM users WHERE email LIKE '%@po-test.local'");
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

test('1 unauthenticated → 401', async () => {
  assert.equal((await request(app).get('/api/v1/purchase-orders')).status, 401);
});

test('2 missing purchase_order.view → 403', async () => {
  assert.equal((await agentNoPerms.get('/api/v1/purchase-orders')).status, 403);
});

test('3 missing purchase_order.create → 403', async () => {
  const res = await agentViewOnlyPO.post('/api/v1/purchase-orders').send({ organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id, lines: [{ productId, unitId, quantity: 1, unitPrice: 1 }] });
  assert.equal(res.status, 403);
});

test('4 valid PO creation works', async () => {
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    expectedDeliveryDate: '2026-12-01', currency: 'ETB', notes: 'Monthly order',
    lines: [{ productId, unitId, quantity: 10, unitPrice: 120.5, notes: 'Routine' }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.purchaseOrder.status, 'draft');
  assert.equal(res.body.data.purchaseOrder.lines.length, 1);
  assert.equal(Number(res.body.data.purchaseOrder.lines[0].line_total), 1205.00);
  assert.equal(Number(res.body.data.purchaseOrder.total_amount), 1205.00);
});

test('5 supplier inactive → 409', async () => {
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplierInactiveId,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  assert.equal(res.status, 409);
});

test('6 invalid/inactive product rejected', async () => {
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId: inactiveProductId, unitId, quantity: 1, unitPrice: 10 }],
  });
  assert.equal(res.status, 400);
});

test('7 wrong supplier org rejected', async () => {
  const [supOrg2] = await pool.query("INSERT INTO suppliers (organization_id, code, name, status) VALUES (?, 'SUP2O2', 'Different Org Supplier', 'active')", [org2Id]);
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supOrg2.insertId,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  assert.equal(res.status, 400);
  await pool.query('DELETE FROM suppliers WHERE id = ?', [supOrg2.insertId]);
});

test('8 quantity=0 rejected and empty lines rejected', async () => {
  const a = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 0, unitPrice: 10 }],
  });
  assert.equal(a.status, 400);
  const b = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id, lines: [],
  });
  assert.equal(b.status, 400);
});

test('9 lines invalid unit mapping rejected', async () => {
  const [otherUnit] = await pool.query("INSERT INTO units (organization_id, name, code) VALUES (?, 'Pair', 'PAAR')", [org1Id]);
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId: otherUnit.insertId, quantity: 1, unitPrice: 10 }],
  });
  assert.equal(res.status, 400);
  await pool.query('DELETE FROM units WHERE id = ?', [otherUnit.insertId]);
});

test('10 multiple lines sum correctly', async () => {
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [
      { productId, unitId, quantity: 2, unitPrice: 100 },
      { productId, unitId, quantity: 3, unitPrice: 50 },
    ],
  });
  assert.equal(Number(res.body.data.purchaseOrder.total_amount), 350);
});

test('11 draft update works (lines, notes, dates)', async () => {
  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  const id = create.body.data.purchaseOrder.id;
  const update = await agentAdmin.patch(`/api/v1/purchase-orders/${id}`).send({
    notes: 'Updated notes',
    lines: [{ productId, unitId, quantity: 5, unitPrice: 20 }],
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.data.purchaseOrder.notes, 'Updated notes');
  assert.equal(Number(update.body.data.purchaseOrder.total_amount), 100);
});

test('12 supplier immutable on update', async () => {
  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  const id = create.body.data.purchaseOrder.id;
  const update = await agentAdmin.patch(`/api/v1/purchase-orders/${id}`).send({ supplierId: supplier1Id + 999 });
  assert.equal(update.status, 409);
});

test('13 submit → pending_approval, approve allowed with permission', async () => {
  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  const id = create.body.data.purchaseOrder.id;

  const submit = await agentAdmin.post(`/api/v1/purchase-orders/${id}/submit`);
  assert.equal(submit.body.data.purchaseOrder.status, 'pending_approval');

  const alter = await agentAdmin.patch(`/api/v1/purchase-orders/${id}`).send({ notes: 'change once submitted' });
  assert.equal(alter.status, 409);

  const approve = await agentAdmin.post(`/api/v1/purchase-orders/${id}/approve`);
  assert.equal(approve.status, 200);
  assert.equal(approve.body.data.purchaseOrder.status, 'approved');
});

test('14 approve without permission 403', async () => {
  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  const id = create.body.data.purchaseOrder.id;
  await agentAdmin.post(`/api/v1/purchase-orders/${id}/submit`);
  const forbidden = await agentCreateOnlyPO.post(`/api/v1/purchase-orders/${id}/approve`);
  assert.equal(forbidden.status, 403);
});

test('15 reject from pending_approval', async () => {
  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  const id = create.body.data.purchaseOrder.id;
  await agentAdmin.post(`/api/v1/purchase-orders/${id}/submit`);
  const rejected = await agentApprover.post(`/api/v1/purchase-orders/${id}/reject`).send({ reason: 'Out of budget' });
  assert.equal(rejected.body.data.purchaseOrder.status, 'rejected');
  assert.equal(rejected.body.data.purchaseOrder.rejection_reason, 'Out of budget');
});

test('16 cancel from draft works; fully-accepted states guard cancel', async () => {
  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 1, unitPrice: 10 }],
  });
  const id = create.body.data.purchaseOrder.id;
  const cancelled = await agentAdmin.post(`/api/v1/purchase-orders/${id}/cancel`).send({ reason: 'Mistake created' });
  assert.equal(cancelled.body.data.purchaseOrder.status, 'cancelled');
});

test('17 inventory unchanged by PO create/update/submit/approve', async () => {
  const invBefore = (await pool.query('SELECT COUNT(*) AS n FROM inventory'))[0][0].n;
  const mvBefore = (await pool.query('SELECT COUNT(*) AS n FROM stock_movements'))[0][0].n;

  const create = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [{ productId, unitId, quantity: 10, unitPrice: 50 }],
  });
  const id = create.body.data.purchaseOrder.id;
  await agentAdmin.patch(`/api/v1/purchase-orders/${id}`).send({ notes: 'extra' });
  await agentAdmin.post(`/api/v1/purchase-orders/${id}/submit`);
  await agentApprover.post(`/api/v1/purchase-orders/${id}/approve`);

  const invAfter = (await pool.query('SELECT COUNT(*) AS n FROM inventory'))[0][0].n;
  const mvAfter = (await pool.query('SELECT COUNT(*) AS n FROM stock_movements'))[0][0].n;
  assert.equal(invAfter, invBefore);
  assert.equal(mvAfter, mvBefore);
});

test('18 transactional rollback when one line is invalid', async () => {
  const before_n = (await pool.query('SELECT COUNT(*) AS n FROM purchase_orders'))[0][0].n;
  const res = await agentAdmin.post('/api/v1/purchase-orders').send({
    organizationId: org1Id, branchId: branch1Id, supplierId: supplier1Id,
    lines: [
      { productId, unitId, quantity: 1, unitPrice: 10 },
      { productId, unitId, quantity: 0, unitPrice: 10 },
    ],
  });
  assert.equal(res.status, 400);
  const after_n = (await pool.query('SELECT COUNT(*) AS n FROM purchase_orders'))[0][0].n;
  assert.equal(after_n, before_n);
});

test('19 branch-scoped user sees only branch rows', async () => {
  const list = await agentBranch.get('/api/v1/purchase-orders');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.every((row) => row.branch_id === branch1Id));
});

test('20 org2 scope empty', async () => {
  const list = await agentOrg2.get('/api/v1/purchase-orders');
  assert.equal(list.body.data.total, 0);
});

test('21 search works', async () => {
  const list = await agentAdmin.get('/api/v1/purchase-orders?search=Local');
  assert.ok(list.body.data.total >= 1);
});

test('22 status filter works', async () => {
  const approved = await agentAdmin.get('/api/v1/purchase-orders?status=approved');
  assert.ok(approved.body.data.items.every((p) => p.status === 'approved'));
});
