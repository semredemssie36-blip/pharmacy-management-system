/**
 * Task 06 — Inventory Foundation tests.
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
let inventoryService;
let org1Id;
let org2Id;
let branch1Id;
let warehouse1Id;
let location1Id;
let branch2Id;
let warehouse2Id;
let location2Id;
let product1Id;
let batchId;
let unitId;
let ownerAgent;     // all perms, org1 scope
let org2Agent;      // all perms, org2 scope
let branchAgent;    // all perms, branch1 scope
let warehouseAgent; // all perms, warehouse1 scope
let noPermsAgent;
let inventoryAgent; // inventory.view only + branch1 scope

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function roleWithAllPermissions(name, code) {
  const [r] = await pool.query('INSERT INTO roles (name, code, status) VALUES (?, ?, ?)', [name, code, 'active']);
  await pool.query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions', [r.insertId]);
  return r.insertId;
}

async function agentFor(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;
  inventoryService = (await import('../src/services/inventoryService.js')).default;

  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM recall_actions').catch(() => {});
  await pool.query('DELETE FROM recall_batches').catch(() => {});
  await pool.query('DELETE FROM recall_cases').catch(() => {});
  await pool.query('DELETE FROM quarantine_cases').catch(() => {});
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM product_relationships');
  await pool.query('DELETE FROM product_unit_conversions');
  await pool.query('DELETE FROM product_units');
  await pool.query('DELETE FROM product_active_ingredients');
  await pool.query('DELETE FROM products');
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
  await pool.query("DELETE FROM users WHERE email LIKE '%@inv-test.local'");
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');

  const [o1] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Inv Org One', 'INV1')");
  const [o2] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Inv Org Two', 'INV2')");
  org1Id = o1.insertId;
  org2Id = o2.insertId;

  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)', [org1Id, 'Piassa Branch', 'PIAS']);
  const [b2] = await pool.query('INSERT INTO branches (organization_id, name, code) VALUES (?, ?, ?)', [org2Id, 'Megenagna Branch', 'MEGN']);
  branch1Id = b1.insertId;
  branch2Id = b2.insertId;

  const [w1] = await pool.query('INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)', [branch1Id, 'Piassa Main WH', 'PWH']);
  const [w2] = await pool.query('INSERT INTO warehouses (branch_id, name, code) VALUES (?, ?, ?)', [branch2Id, 'Megenagna Main WH', 'MWH']);
  warehouse1Id = w1.insertId;
  warehouse2Id = w2.insertId;

  const [l1] = await pool.query('INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, ?, ?, ?)', [warehouse1Id, 'Shelf A', 'SA', 'normal']);
  const [l2] = await pool.query('INSERT INTO storage_locations (warehouse_id, name, code, storage_condition) VALUES (?, ?, ?, ?)', [warehouse2Id, 'Shelf A', 'SA', 'normal']);
  location1Id = l1.insertId;
  location2Id = l2.insertId;

  const [uResult] = await pool.query("INSERT INTO units (organization_id, name, code) VALUES (?, 'Box', 'BOX'), (?, 'Tablet', 'TAB')", [org1Id, org1Id]);
  unitId = uResult.insertId; // first unit (Box)

  // an unknown-organization unit to test isolation
  const [uResult2] = await pool.query("INSERT INTO units (organization_id, name, code) VALUES (?, 'Unknown Box', 'UBOX')", [org2Id]);
  const unknownUnitId = uResult2.insertId;

  const [bResult] = await pool.query("INSERT INTO batches (organization_id, product_id, batch_number, expiry_date) VALUES (?, 0, 'x', '2099-01-01')", [0]).catch(() => [[]]);
  // batches need a valid product FK — inserted later
  await pool.query("DELETE FROM batches WHERE product_id = 0");

  const [pResult] = await pool.query(
    "INSERT INTO products (organization_id, code, name, prescription_classification) VALUES (?, 'P1', 'Amoxicillin 500', 'prescription')",
    [org1Id],
  );
  product1Id = pResult.insertId;

  const [b1Result] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date) VALUES (?, ?, ?, ?)',
    [org1Id, product1Id, 'BATCH001', '2028-12-31'],
  );
  batchId = b1Result.insertId;

  const [u2Result] = await pool.query("INSERT INTO units (organization_id, name, code) VALUES (?, 'Tablet', 'TABS')", [org2Id]);
  void u2Result;

  const allRoleId = await roleWithAllPermissions('InvAll', 'INVALL');
  const viewOnlyRoleId = await roleWithAllPermissions('InvView', 'INVVIEWROLEP');
  // Restrict viewOnly role to inventory.view only
  await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [viewOnlyRoleId]);
  await pool.query(
    "INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code IN ('inventory.view')",
    [viewOnlyRoleId],
  );

  const mainUserId = await insertUser('Main Inv', 'main@inv-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [mainUserId, allRoleId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [mainUserId, org1Id]);

  const org2UserId = await insertUser('Org Two Inv', 'org2@inv-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [org2UserId, allRoleId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [org2UserId, org2Id]);

  const branchUserId = await insertUser('Piassa Store', 'branch@inv-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [branchUserId, allRoleId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [branchUserId, branch1Id]);

  const warehouseUserId = await insertUser('Piassa Wh', 'warehouse@inv-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [warehouseUserId, allRoleId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, warehouse_id) VALUES (?, 'warehouse', ?)", [warehouseUserId, warehouse1Id]);

  await insertUser('NoPerms', 'noperms@inv-test.local');

  const viewOnlyUserId = await insertUser('Viewer', 'viewer@inv-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [viewOnlyUserId, viewOnlyRoleId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [viewOnlyUserId, branch1Id]);

  ownerAgent = await agentFor('main@inv-test.local');
  org2Agent = await agentFor('org2@inv-test.local');
  branchAgent = await agentFor('branch@inv-test.local');
  warehouseAgent = await agentFor('warehouse@inv-test.local');
  noPermsAgent = await agentFor('noperms@inv-test.local');
  inventoryAgent = await agentFor('viewer@inv-test.local');
});

after(async () => {
  try {
    if (pool) {
      await pool.query('DELETE FROM stock_movements');
      await pool.query('DELETE FROM inventory');
      await pool.query('DELETE FROM recall_actions').catch(() => {});
      await pool.query('DELETE FROM recall_batches').catch(() => {});
      await pool.query('DELETE FROM recall_cases').catch(() => {});
      await pool.query('DELETE FROM quarantine_cases').catch(() => {});
      await pool.query('DELETE FROM batches');
      await pool.query('DELETE FROM products');
      await pool.query('DELETE FROM units');
      await pool.query('DELETE FROM users WHERE email LIKE "%@inv-test.local"');
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

test('1 unauthenticated inventory request is rejected', async () => {
  assert.equal((await request(app).get('/api/v1/inventory')).status, 401);
});

test('2 user without inventory.view receives 403', async () => {
  assert.equal((await noPermsAgent.get('/api/v1/inventory')).status, 403);
});

test('3 org-scoped user with inventory.view can list inventory', async () => {
  const res = await ownerAgent.get('/api/v1/inventory');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test('4 branch-scoped user only sees their branch rows', async () => {
  const res = await branchAgent.get('/api/v1/inventory');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.items.every((row) => row.branch_id === branch1Id));
});

test('5 warehouse-scoped user only sees their warehouse rows', async () => {
  const res = await warehouseAgent.get('/api/v1/inventory');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.items.every((row) => row.warehouse_id === warehouse1Id));
});

test('6 unauthenticated stock movement list check', async () => {
  assert.equal((await request(app).get('/api/v1/stock-movements')).status, 401);
});

test('7 org2 scope isolates org1 data in list', async () => {
  // First create an opening-balance record in org1 (via ownerAgent)...
  const ob = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: warehouse1Id,
    storageLocationId: location1Id,
    productId: product1Id,
    batchNumber: 'BATCH001',
    expiryDate: '2028-12-31',
    unitId,
    quantity: 20,
    reason: 'Initial stock',
  });
  assert.equal(ob.status, 201);

  const org2List = await org2Agent.get('/api/v1/inventory');
  assert.equal(org2List.body.data.total, 0);
});

test('8 batch references a wrong product are rejected', async () => {
  // Try opening balance with batchId of another product (organization-wide, product mismatch)
  const [p2] = await pool.query("INSERT INTO products (organization_id, code, name, prescription_classification) VALUES (?, 'P2', 'Other', 'otc')", [org1Id]);
  const [b2] = await pool.query('INSERT INTO batches (organization_id, product_id, batch_number, expiry_date) VALUES (?, ?, ?, ?)', [org1Id, p2.insertId, 'OTHER1', '2027-01-01']);
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchId: b2.insertId, unitId, quantity: 5,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  await pool.query('DELETE FROM batches WHERE id = ?', [b2.insertId]);
  await pool.query('DELETE FROM products WHERE id = ?', [p2.insertId]);
});

test('9 warehouse outside branch rejected', async () => {
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse2Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'B9', expiryDate: '2028-01-01', unitId, quantity: 5,
  });
  assert.equal(res.status, 400);
});

test('10 storage location from different warehouse rejected', async () => {
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location2Id,
    productId: product1Id, batchNumber: 'B10', expiryDate: '2028-01-01', unitId, quantity: 5,
  });
  assert.equal(res.status, 400);
});

test('11 invalid unit (wrong organization) is rejected', async () => {
  const [u2] = await pool.query("SELECT id FROM units WHERE organization_id = ? AND code = 'UBOX'", [org2Id]);
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'BXUNIT', expiryDate: '2028-01-01', unitId: u2[0].id, quantity: 5,
  });
  assert.equal(res.status, 400);
});

test('12 zero / negative opening balance rejected', async () => {
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'B12', expiryDate: '2028-01-01', unitId, quantity: 0,
  });
  assert.equal(res.status, 400);
});

test('13 opening balance creates inventory + movement (happy path)', async () => {
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'BATCH001', expiryDate: '2028-12-31', unitId, quantity: 20, reason: 'Initial stock',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'available');

  const movement = await pool.query('SELECT movement_type, quantity_delta FROM stock_movements WHERE id = ?', [res.body.data.movementId]);
  assert.equal(movement[0][0].movement_type, 'opening_balance');
  assert.equal(Number(movement[0][0].quantity_delta), 20);
});

test('14 second opening on same position sums quantity and adds movements', async () => {
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'BATCH001', expiryDate: '2028-12-31', unitId, quantity: 10,
  });
  assert.equal(res.status, 201);
  const inv = await pool.query('SELECT quantity FROM inventory WHERE id = ?', [res.body.data.inventoryId]);
  assert.equal(Number(inv[0][0].quantity), 30); // 20 + 10
  const movementCount = await pool.query('SELECT COUNT(*) AS n FROM stock_movements');
  assert.equal(Number(movementCount[0][0].n), 2);
});

test('15 shortage in available stock prevents decrement and records no movement', async () => {
  const invId = (await pool.query('SELECT id FROM inventory LIMIT 1'))[0][0].id;
  const [mainRows] = await pool.query("SELECT id FROM users WHERE email = 'main@inv-test.local'");
  const uid = mainRows[0].id;
  let caught = false;
  try {
    await inventoryService.decreaseAvailableStock({ inventoryId: invId, userId: uid, quantity: 1000, reason: 'over-usage' });
  } catch (err) {
    caught = true;
    assert.equal(err.code, 'INSUFFICIENT_STOCK');
  }
  assert.ok(caught);
  const invs = await pool.query('SELECT quantity FROM inventory WHERE id = ?', [invId]);
  assert.equal(Number(invs[0][0].quantity), 30);
  const movements = await pool.query('SELECT COUNT(*) AS n FROM stock_movements');
  assert.equal(Number(movements[0][0].n), 2);
});

test('16 successful decrement reduces stock and writes one movement', async () => {
  const invId = (await pool.query("SELECT id FROM inventory WHERE status = 'available' LIMIT 1"))[0][0].id;
  const movementUser = (await pool.query("SELECT id FROM users WHERE email = 'main@inv-test.local'"))[0][0].id;
  const res = await inventoryService.decreaseAvailableStock({ inventoryId: invId, userId: movementUser, quantity: 5, reason: 'test' });
  assert.equal(res.remaining, 25);
  const movement = await pool.query('SELECT quantity_delta, movement_type FROM stock_movements ORDER BY id DESC LIMIT 1');
  assert.equal(movement[0][0].movement_type, 'other');
  assert.equal(Number(movement[0][0].quantity_delta), -5);
});

test('17 two parallel 8-qty decrements on 10 produce exactly one success', async () => {
  // Fresh inventory row with quantity 10
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'CONCUR1', expiryDate: '2099-01-01', unitId, quantity: 10,
  });
  const invId = (await pool.query('SELECT id FROM inventory LIMIT 1'))[0][0].id;
  // user 1 is the ownerAgent user — find its id
  const agentUserRow = await pool.query("SELECT id FROM users WHERE email = 'main@inv-test.local'");
  const uid = agentUserRow[0][0].id;

  const [r1, r2] = await Promise.allSettled([
    inventoryService.decreaseAvailableStock({ inventoryId: invId, userId: uid, quantity: 8 }),
    inventoryService.decreaseAvailableStock({ inventoryId: invId, userId: uid, quantity: 8 }),
  ]);
  const successes = [r1, r2].filter((r) => r.status === 'fulfilled').length;
  const failures = [r1, r2].filter((r) => r.status === 'rejected').length;
  assert.equal(successes, 1);
  assert.equal(failures, 1);
  const inv = await pool.query('SELECT quantity FROM inventory WHERE id = ?', [invId]);
  assert.equal(Number(inv[0][0].quantity), 2);
});

test('18 expired batch is marked "expired" and is never available', async () => {
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  const res = await ownerAgent.post('/api/v1/inventory/opening-balance').send({
    organizationId: org1Id, branchId: branch1Id, warehouseId: warehouse1Id, storageLocationId: location1Id,
    productId: product1Id, batchNumber: 'EXPIRED1', expiryDate: '2020-01-01', unitId, quantity: 5,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'expired');
  const inv = await pool.query('SELECT status FROM inventory LIMIT 1');
  assert.equal(inv[0][0].status, 'expired');
});

test('19 batch expiry is reported below detail', async () => {
  const batchRow = (await pool.query('SELECT b.id, b.expiry_date FROM batches b ORDER BY b.id DESC LIMIT 1'))[0][0];
  const res = await ownerAgent.get(`/api/v1/batches/${batchRow.id}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.batch.expiry_date);
});

test('20 stock movement record preserves batch + location', async () => {
  const batchNumber = 'EXPIRED1';
  const mv = await pool.query('SELECT m.batch_id, m.warehouse_id, m.storage_location_id FROM stock_movements m ORDER BY m.id DESC LIMIT 1');
  assert.equal(mv[0][0].batch_id, (await pool.query('SELECT id FROM batches WHERE batch_number = ?', [batchNumber]))[0][0].id);
  assert.equal(mv[0][0].warehouse_id, warehouse1Id);
  assert.equal(mv[0][0].storage_location_id, location1Id);
});

test('21 inventory listing is scope-filtered, has search, filters, and pagination', async () => {
  const page = await warehouseAgent.get('/api/v1/inventory?page=1&limit=1');
  assert.equal(page.status, 200);
  assert.ok(page.body.data.items.every((row) => row.warehouse_id === warehouse1Id));

  const search = await ownerAgent.get('/api/v1/inventory?search=Amoxicillin');
  assert.ok(search.body.data.items.length >= 1);
  const noResults = await ownerAgent.get('/api/v1/inventory?search=zzznothing');
  assert.equal(noResults.body.data.total, 0);

  const dupByWarehouseScope = await org2Agent.get('/api/v1/inventory?warehouseId=' + warehouse1Id);
  assert.equal(dupByWarehouseScope.body.data.total, 0);
});

test('22 negative-stock protection keeps list unusable by check scope', async () => {
  // No consuming movement has ever been allowed to push inventory negative.
  const negatives = await pool.query('SELECT COUNT(*) AS n FROM inventory WHERE quantity < 0');
  assert.equal(Number(negatives[0][0].n), 0);
});

test('23 stock movement endpoints are read-only', async () => {
  const del = await ownerAgent.delete('/api/v1/stock-movements/1').catch(() => ({ status: 404 }));
  assert.ok([404, 405, 400].includes(del.status));
  const patch = await ownerAgent.patch('/api/v1/stock-movements/1').send({ quantity_delta: 99 }).catch(() => ({ status: 404 }));
  assert.ok([404, 405, 400].includes(patch.status));
});

test('24 org2 scope isolates data in stock movements list', async () => {
  const list = await org2Agent.get('/api/v1/stock-movements');
  assert.equal(list.body.data.total, 0);
});

test('25 branch inventory list does not expose other branches', async () => {
  const list = await branchAgent.get('/api/v1/inventory');
  assert.ok(list.body.data.items.every((row) => row.branch_id === branch1Id));
});
