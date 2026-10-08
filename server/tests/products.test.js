/**
 * Task 05 — Product Master backend tests.
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
let org1Id;
let org2Id;
let mainAgent; // full perms, scope org1
let org2Agent; // full perms, scope org2
let noPermsAgent; // no roles
let viewOnlyAgent; // product.view + scope org1

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function roleWithPermissions(name, code, whereClause) {
  const [r] = await pool.query(
    'INSERT INTO roles (name, code, status) VALUES (?, ?, ?)',
    [name, code, 'active'],
  );
  await pool.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE ${whereClause}`, [r.insertId]);
  return r.insertId;
}

async function loginAgent(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

async function fetchOrCreateMaster(agent, routePath, responseKey, organizationId, data) {
  const created = await agent.post(`/api/v1/${routePath}`).send({ organizationId, ...data });
  if (created.status === 201) return created.body.data[responseKey];
  // already exists — look it up by exact code within this organization
  const lookup = await agent.get(`/api/v1/${routePath}?search=${encodeURIComponent(data.code || data.name)}&organizationId=${organizationId}`);
  const keyForPlural = responseKey; // keys align per-entity
  const list = lookup.body.data.items || [];
  const found = list.find((row) => row.code === data.code);
  if (!found) throw new Error(`Could not fetch-or-create master row ${routePath}/${data.code}: ${JSON.stringify(created.body)}`);
  return found;
}

async function createMasterRows(agent, organizationId) {
  const brand = await fetchOrCreateMaster(agent, 'brands', 'brand', organizationId, { name: 'Demo Brand', code: 'DBRAND' });
  const generic = await fetchOrCreateMaster(agent, 'generics', 'generic', organizationId, { name: 'Amoxicillin', code: 'AMOX' });
  const dosageForm = await fetchOrCreateMaster(agent, 'dosage-forms', 'dosageForm', organizationId, { name: 'Capsule', code: 'CAP' });
  const route = await fetchOrCreateMaster(agent, 'routes', 'route', organizationId, { name: 'Oral', code: 'ORAL' });
  const category = await fetchOrCreateMaster(agent, 'categories', 'category', organizationId, { name: 'Antibiotics', code: 'ANTIB' });
  const therapeutic = await fetchOrCreateMaster(agent, 'therapeutic-categories', 'therapeuticCategory', organizationId, { name: 'Antibacterial', code: 'ANTIBAC' });
  const manufacturer = await fetchOrCreateMaster(agent, 'manufacturers', 'manufacturer', organizationId, { name: 'Demo Manufacturer', code: 'DMFR', countryOfOrigin: 'Ethiopia' });
  const ingredient = await fetchOrCreateMaster(agent, 'active-ingredients', 'activeIngredient', organizationId, { name: 'Amoxicillin Trihydrate', code: 'AMOX_TRI' });
  const unitA = await fetchOrCreateMaster(agent, 'units', 'unit', organizationId, { name: 'Box', code: 'BOX' });
  const unitB = await fetchOrCreateMaster(agent, 'units', 'unit', organizationId, { name: 'Strip', code: 'STRIP' });
  const unitC = await fetchOrCreateMaster(agent, 'units', 'unit', organizationId, { name: 'Tablet', code: 'TAB' });
  return {
    brandId: brand.id,
    genericId: generic.id,
    dosageFormId: dosageForm.id,
    routeId: route.id,
    categoryId: category.id,
    therapeuticCategoryId: therapeutic.id,
    manufacturerId: manufacturer.id,
    ingredientId: ingredient.id,
    unitIds: [unitA.id, unitB.id, unitC.id],
  };
}

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  // Reset product master tables (preserve users/roles/permissions used by other suites).
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
  await pool.query("DELETE FROM users WHERE email LIKE '%@product-test.local'");
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM organizations');

  const [o1] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Org One (Test)', 'ORG1_TEST')");
  const [o2] = await pool.query("INSERT INTO organizations (name, code) VALUES ('Org Two (Test)', 'ORG2_TEST')");
  org1Id = o1.insertId;
  org2Id = o2.insertId;

  const allRoleId = await roleWithPermissions('All Permissions', 'ALL_PERMS_TEST', "id >= 1 AND id <= 65");
  const viewRoleId = await roleWithPermissions('Product View Only', 'PRODUCT_VIEW_ONLY_TEST', "code = 'product.view'");

  const mainUserId = await insertUser('Product Admin', 'main@product-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [mainUserId, allRoleId]);
  await pool.query(
    "INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)",
    [mainUserId, org1Id],
  );

  const org2UserId = await insertUser('Org Two Admin', 'org2@product-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [org2UserId, allRoleId]);
  await pool.query(
    "INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)",
    [org2UserId, org2Id],
  );

  const viewUserId = await insertUser('Product Viewer', 'view@product-test.local');
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [viewUserId, viewRoleId]);
  await pool.query(
    "INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)",
    [viewUserId, org1Id],
  );

  await insertUser('No Perms', 'noperms@product-test.local');

  mainAgent = await loginAgent('main@product-test.local');
  org2Agent = await loginAgent('org2@product-test.local');
  viewOnlyAgent = await loginAgent('view@product-test.local');
  noPermsAgent = await loginAgent('noperms@product-test.local');
});

after(async () => {
  try {
    if (pool) {
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
      await pool.query("DELETE FROM users WHERE email LIKE '%@product-test.local'");
      await pool.query('DELETE FROM branches');
      await pool.query('DELETE FROM warehouses');
      await pool.query('DELETE FROM storage_locations');
      await pool.query('DELETE FROM organizations');
    }
  } finally {
    if (closePool) await closePool();
  }
});

test('1 unauthenticated product request returns 401', async () => {
  const res = await request(app).get('/api/v1/products');
  assert.equal(res.status, 401);
});

test('2 authenticated user without product.view returns 403', async () => {
  const res = await noPermsAgent.get('/api/v1/products');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

test('3 user with product.view and correct organization scope succeeds', async () => {
  const res = await viewOnlyAgent.get('/api/v1/products');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test('4 users without organization scope get 403 on product detail', async () => {
  // viewOnlyAgent has no scope on org2, member of main role there → create via org2Agent then view from mainAgent.
  const master = await createMasterRows(org2Agent, org2Id);
  const created = await org2Agent.post('/api/v1/products').send({
    organizationId: org2Id,
    name: 'Org2 Product',
    code: 'ORG2PROD',
    prescriptionClassification: 'otc',
    ...master,
  });
  assert.equal(created.status, 201);
  const id = created.body.data.product.id;

  // mainAgent cannot see it
  const detailAsMain = await mainAgent.get(`/api/v1/products/${id}`);
  assert.equal(detailAsMain.status, 403);

  // cross-organization list isolation
  const listAsMain = await mainAgent.get('/api/v1/products?organizationId=' + org2Id);
  assert.equal(listAsMain.status, 200);
  assert.equal(listAsMain.body.data.total, 0);
});

test('5 cross-organization product detail is denied', async () => {
  const master = await createMasterRows(org2Agent, org2Id);
  const created = await org2Agent.post('/api/v1/products').send({
    organizationId: org2Id, name: 'Org2 Detail', code: 'ORG2DET', prescriptionClassification: 'otc', ...master,
  });
  const detail = await mainAgent.get(`/api/v1/products/${created.body.data.product.id}`);
  assert.equal(detail.status, 403);
});

test('6 product creation requires product.create', async () => {
  const res = await viewOnlyAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'X', code: 'X', prescriptionClassification: 'otc' });
  assert.equal(res.status, 403);
});

test('7 product update requires product.update', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const created = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'Update Target', code: 'UPD', prescriptionClassification: 'otc', ...master,
  });
  const id = created.body.data.product.id;
  const res = await viewOnlyAgent.patch(`/api/v1/products/${id}`).send({ name: 'Renamed' });
  assert.equal(res.status, 403);
});

test('8 product deactivation requires product.deactivate', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const created = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'Deactivate Target', code: 'DEACT', prescriptionClassification: 'otc', ...master,
  });
  const id = created.body.data.product.id;
  const res = await viewOnlyAgent.post(`/api/v1/products/${id}/deactivate`);
  assert.equal(res.status, 403);
});

test('9 duplicate product code is rejected', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const first = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'A', code: 'DUPC', prescriptionClassification: 'otc', ...master,
  });
  assert.equal(first.status, 201);
  const second = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'B', code: 'DUPC', prescriptionClassification: 'otc', ...master,
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DUPLICATE_PRODUCT_CODE');
});

test('10 duplicate barcode is rejected per organization', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const first = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'A', code: 'BAR1', barcode: 'BARCODE123', prescriptionClassification: 'otc', ...master,
  });
  assert.equal(first.status, 201);
  const second = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'B', code: 'BAR2', barcode: 'BARCODE123', prescriptionClassification: 'otc', ...master,
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DUPLICATE_PRODUCT_BARCODE');
});

test('11 invalid master-data references are rejected', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const res = await mainAgent.post('/api/v1/products').send({
    ...master,
    organizationId: org1Id, name: 'Bad Ref', code: 'BADREF', brandId: 999999, prescriptionClassification: 'otc',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('12 invalid unit conversions are rejected', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const created = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'Conv Product', code: 'CONV', prescriptionClassification: 'otc', ...master,
  });
  const pid = created.body.data.product.id;

  const badFactor = await mainAgent.put(`/api/v1/products/${pid}/unit-conversions`).send({ conversions: [{ fromUnitId: master.unitIds[0], toUnitId: master.unitIds[1], factor: 0 }] });
  assert.equal(badFactor.status, 400);

  const selfConversion = await mainAgent.put(`/api/v1/products/${pid}/unit-conversions`).send({ conversions: [{ fromUnitId: master.unitIds[0], toUnitId: master.unitIds[0], factor: 5 }] });
  assert.equal(selfConversion.status, 400);

  const duplicateConversion = await mainAgent.put(`/api/v1/products/${pid}/unit-conversions`).send({
    conversions: [
      { fromUnitId: master.unitIds[0], toUnitId: master.unitIds[1], factor: 10 },
      { fromUnitId: master.unitIds[0], toUnitId: master.unitIds[1], factor: 12 },
    ],
  });
  assert.equal(duplicateConversion.status, 400);
});

test('13 duplicate product relationships are rejected', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const a = await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'Rel A', code: 'RELA', prescriptionClassification: 'otc', ...master });
  const b = await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'Rel B', code: 'RELB', prescriptionClassification: 'otc', ...master });
  const res = await mainAgent.put(`/api/v1/products/${a.body.data.product.id}/relationships`).send({
    relationships: [
      { relatedProductId: b.body.data.product.id, relationshipType: 'equivalent' },
      { relatedProductId: b.body.data.product.id, relationshipType: 'equivalent' },
    ],
  });
  assert.equal(res.status, 400);
});

test('14 self-relationship is rejected', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const a = await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'Self Rel', code: 'SELFREL', prescriptionClassification: 'otc', ...master });
  const res = await mainAgent.put(`/api/v1/products/${a.body.data.product.id}/relationships`).send({
    relationships: [{ relatedProductId: a.body.data.product.id, relationshipType: 'alternative' }],
  });
  assert.equal(res.status, 400);
});

test('15 linking an inactive master record is rejected', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const inactiveBrand = await mainAgent.post('/api/v1/brands').send({ organizationId: org1Id, name: 'Inactive Brand', code: 'INACTB' });
  const inactiveBrandId = inactiveBrand.body.data.brand.id;
  await mainAgent.post(`/api/v1/brands/${inactiveBrandId}/deactivate`);
  const res = await mainAgent.post('/api/v1/products').send({
    ...master,
    organizationId: org1Id, name: 'Inactive Link', code: 'INACTLINK', brandId: inactiveBrandId, prescriptionClassification: 'otc',
  });
  assert.equal(res.status, 400);
});

test('16 product list is organization-scoped', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'Org1 Visible', code: 'ORG1VIS', prescriptionClassification: 'otc', ...master });

  const mainView = await mainAgent.get('/api/v1/products');
  assert.equal(mainView.status, 200);
  assert.ok(mainView.body.data.items.every((p) => p.organization_id === org1Id));

  const org2View = await org2Agent.get('/api/v1/products');
  assert.equal(org2View.status, 200);
  assert.ok(org2View.body.data.items.every((p) => p.organization_id === org2Id));
});

test('17 search works', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'Paracetamol 500mg', code: 'PARA500', prescriptionClassification: 'otc', ...master, genericId: master.genericId });

  const found = await mainAgent.get(`/api/v1/products?search=paracetamol`);
  assert.equal(found.status, 200);
  assert.ok(found.body.data.items.some((p) => p.name.includes('Paracetamol')));

  const missing = await mainAgent.get(`/api/v1/products?search=zzzz-not-here`);
  assert.equal(missing.body.data.total, 0);
});

test('18 pagination works', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  for (let i = 1; i <= 3; i += 1) {
    await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: `Bulk Product ${i}`, code: `BULK${i}`, prescriptionClassification: 'otc', ...master });
  }
  const page1 = await mainAgent.get('/api/v1/products?limit=2&page=1&sort=code');
  assert.equal(page1.body.data.items.length, 2);
  assert.ok(page1.body.data.total >= 3);
});

test('19 filtering works', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'Rx Only', code: 'RXONLY', prescriptionClassification: 'prescription', ...master });
  await mainAgent.post('/api/v1/products').send({ organizationId: org1Id, name: 'OTC Only', code: 'OTCONLY', prescriptionClassification: 'otc', ...master });

  const prescriptionOnly = await mainAgent.get('/api/v1/products?prescriptionClassification=prescription');
  assert.ok(prescriptionOnly.body.data.items.every((p) => p.prescription_classification === 'prescription'));

  const otcOnly = await mainAgent.get('/api/v1/products?prescriptionClassification=otc');
  assert.ok(otcOnly.body.data.items.every((p) => p.prescription_classification === 'otc'));
});

// Nested happy-path collections
test('ingredients, units, conversions, relationships happy path', async () => {
  const master = await createMasterRows(mainAgent, org1Id);
  const created = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'Nested Product', code: 'NESTED', prescriptionClassification: 'otc', ...master,
  });
  const pid = created.body.data.product.id;

  const ings = await mainAgent.put(`/api/v1/products/${pid}/active-ingredients`).send({ ingredients: [{ activeIngredientId: master.ingredientId, strength: '500mg' }] });
  assert.equal(ings.status, 200);
  assert.equal(ings.body.data.ingredients.length, 1);

  const units = await mainAgent.put(`/api/v1/products/${pid}/units`).send({
    units: [
      { unitId: master.unitIds[0], isBaseUnit: true, isPurchaseUnit: true },
      { unitId: master.unitIds[1], isInventoryUnit: true },
      { unitId: master.unitIds[2], isSellingUnit: true },
    ],
  });
  assert.equal(units.status, 200);

  const conv = await mainAgent.put(`/api/v1/products/${pid}/unit-conversions`).send({
    conversions: [{ fromUnitId: master.unitIds[0], toUnitId: master.unitIds[1], factor: 10 }],
  });
  assert.equal(conv.status, 200);
  assert.equal(Number(conv.body.data.conversions[0].factor), 10);

  const relTarget = await mainAgent.post('/api/v1/products').send({
    organizationId: org1Id, name: 'Nested Target', code: 'NESTTGT', prescriptionClassification: 'otc', ...master,
  });
  const rels = await mainAgent.put(`/api/v1/products/${pid}/relationships`).send({
    relationships: [{ relatedProductId: relTarget.body.data.product.id, relationshipType: 'different_strength' }],
  });
  assert.equal(rels.status, 200);

  const detail = await mainAgent.get(`/api/v1/products/${pid}`);
  assert.equal(detail.body.data.product.ingredients.length, 1);
  assert.equal(detail.body.data.product.units.length, 3);
  assert.equal(detail.body.data.product.conversions.length, 1);
  assert.equal(detail.body.data.product.relationships.length, 1);
});
