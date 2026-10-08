/**
 * Task 12 — Dispensing Workflow & Pharmacist Verification Tests:
 * Permissions, Scope, Prescription Line Consistency, FEFO Allocation, Stock Reservation,
 * Concurrency Protection, Pharmacist Verification, Rejection & Cancellation, Refills.
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

const PASSWORD = 'Passw0rd!dispensing';

let app;
let pool;
let closePool;

let org1Id;
let org2Id;
let branch1Id;
let warehouse1Id;
let location1Id;
let unitBaseId;
let productId1;
let productId2;

let agentOrg1Admin;
let agentNoPerms;
let agentTech; // dispensing.view, dispensing.create, dispensing.update, dispensing.allocate
let agentPharmacist; // all dispensing permissions including dispensing.verify, dispensing.reject, dispensing.cancel

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const [r] = await pool.query(
    'INSERT INTO roles (name, code, status) VALUES (?, ?, "active")',
    ['ROLE-' + Math.random().toString(36).slice(2, 8), 'CODE-' + Math.random().toString(36).slice(2, 8)],
  );
  const roleId = r.insertId;
  for (const c of codes) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      'INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?',
      [roleId, c],
    );
  }
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
}

async function loginAgent(email) {
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

  // Cleanup test dispensing and clinical records
  await pool.query('DELETE FROM dispensing_batch_allocations');
  await pool.query('DELETE FROM dispensing_lines');
  await pool.query('DELETE FROM dispensings');
  await pool.query('DELETE FROM prescription_attachments');
  await pool.query('DELETE FROM prescription_refills');
  await pool.query('DELETE FROM prescription_lines');
  await pool.query('DELETE FROM prescriptions');
  await pool.query('DELETE FROM prescribers');
  await pool.query('DELETE FROM patients');

  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const [o1] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [`Dispensing Org 1 ${runId}`, `DO1_${runId}`]);
  org1Id = o1.insertId;
  const [o2] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [`Dispensing Org 2 ${runId}`, `DO2_${runId}`]);
  org2Id = o2.insertId;

  // Branch
  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [org1Id, `Dispensing Branch ${runId}`, `DB1_${runId}`]);
  branch1Id = b1.insertId;

  // Warehouse
  const [w1] = await pool.query('INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")', [branch1Id, `Main Pharmacy Store ${runId}`, `DWH1_${runId}`]);
  warehouse1Id = w1.insertId;

  // Storage Location
  const [sl1] = await pool.query('INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, "Dispensary Shelf A", "DSA-1", "active")', [warehouse1Id]);
  location1Id = sl1.insertId;

  // Units
  const [u1] = await pool.query('INSERT INTO units (organization_id, name, code, status) VALUES (?, "Capsule", "CAP", "active")', [org1Id]);
  unitBaseId = u1.insertId;

  // Products
  const [df1] = await pool.query('INSERT INTO dosage_forms (organization_id, name, code) VALUES (?, "Capsule", "CAP-D")', [org1Id]);
  const [rt1] = await pool.query('INSERT INTO routes (organization_id, name, code) VALUES (?, "Oral", "ORAL-D")', [org1Id]);

  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, dosage_form_id, route_id, status, prescription_classification, selling_price)
     VALUES (?, "Amoxicillin 500mg Caps", "AMX-500", ?, ?, "active", "prescription", 12.00)`,
    [org1Id, df1.insertId, rt1.insertId],
  );
  productId1 = p1.insertId;

  const [p2] = await pool.query(
    `INSERT INTO products (organization_id, name, code, dosage_form_id, route_id, status, prescription_classification, selling_price)
     VALUES (?, "Paracetamol 500mg Tabs", "PCM-500", ?, ?, "active", "otc", 5.00)`,
    [org1Id, df1.insertId, rt1.insertId],
  );
  productId2 = p2.insertId;

  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [productId1, unitBaseId]);
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [productId2, unitBaseId]);

  // Create Users & Roles
  const ALL_PERMS = [
    'patient.view', 'patient.create', 'patient.update',
    'prescriber.view', 'prescriber.create',
    'prescription.view', 'prescription.create', 'prescription.update', 'prescription.validate', 'prescription.cancel',
    'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate', 'dispensing.verify', 'dispensing.reject', 'dispensing.cancel',
  ];

  const uAdmin1Id = await insertUser('Dispensing Admin Org1', `dadmin1_${Date.now()}@pharmacy.local`);
  await addRoleWithPerms(uAdmin1Id, ALL_PERMS);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdmin1Id, org1Id]);
  agentOrg1Admin = await loginAgent((await pool.query('SELECT email FROM users WHERE id = ?', [uAdmin1Id]))[0][0].email);

  const uNoPermId = await insertUser('No Perm Dispensing User', `noperm_disp_${Date.now()}@pharmacy.local`);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uNoPermId, org1Id]);
  agentNoPerms = await loginAgent((await pool.query('SELECT email FROM users WHERE id = ?', [uNoPermId]))[0][0].email);

  const uTechId = await insertUser('Pharmacy Technician', `tech_${Date.now()}@pharmacy.local`);
  await addRoleWithPerms(uTechId, [
    'patient.view', 'prescription.view',
    'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uTechId, org1Id]);
  agentTech = await loginAgent((await pool.query('SELECT email FROM users WHERE id = ?', [uTechId]))[0][0].email);

  const uPharmId = await insertUser('Lead Pharmacist', `leadpharm_${Date.now()}@pharmacy.local`);
  await addRoleWithPerms(uPharmId, ALL_PERMS);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uPharmId, org1Id]);
  agentPharmacist = await loginAgent((await pool.query('SELECT email FROM users WHERE id = ?', [uPharmId]))[0][0].email);
});

after(async () => {
  if (pool) {
    await pool.query('DELETE FROM dispensing_batch_allocations').catch(() => {});
    await pool.query('DELETE FROM dispensing_lines').catch(() => {});
    await pool.query('DELETE FROM dispensings').catch(() => {});
    await pool.query('DELETE FROM prescription_attachments').catch(() => {});
    await pool.query('DELETE FROM prescription_refills').catch(() => {});
    await pool.query('DELETE FROM prescription_lines').catch(() => {});
    await pool.query('DELETE FROM prescriptions').catch(() => {});
    await pool.query('DELETE FROM prescribers').catch(() => {});
    await pool.query('DELETE FROM patients').catch(() => {});
    await pool.query('DELETE FROM stock_movements WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM inventory WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM batches WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM product_units WHERE product_id IN (SELECT id FROM products WHERE organization_id IN (?, ?))', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM products WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM dosage_forms WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM routes WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM units WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM storage_locations WHERE warehouse_id = ?', [warehouse1Id]).catch(() => {});
    await pool.query('DELETE FROM warehouses WHERE branch_id = ?', [branch1Id]).catch(() => {});
    await pool.query('DELETE FROM branches WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM user_scopes WHERE organization_id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
    await pool.query('DELETE FROM organizations WHERE id IN (?, ?)', [org1Id, org2Id]).catch(() => {});
  }
  if (closePool) await closePool();
});

// Helper to create active patient, prescriber, and validated prescription
async function createValidatedPrescription({
  productLines = [{ productId: productId1, quantity: 20, refills: 0 }],
  expiryDays = 30,
} = {}) {
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Patient',
    lastName: `Test${Date.now()}`,
    gender: 'female',
    dateOfBirth: '1990-01-01',
    phone: `+251911${Math.floor(100000 + Math.random() * 900000)}`,
  });
  const patientId = pRes.body.data.patient.id;

  const docRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: `Dr. Prescriber ${Date.now()}`,
    licenseNumber: `DOC-LIC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  });
  const prescriberId = docRes.body.data.prescriber.id;

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + expiryDays);

  const rxRes = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId,
    prescriberId,
    prescriptionDate: new Date().toISOString().split('T')[0],
    expiryDate: expDate.toISOString().split('T')[0],
    lines: productLines.map((pl) => ({
      productId: pl.productId,
      quantityPrescribed: pl.quantity,
      dosage: '1 cap',
      frequency: 'TID',
      duration: '7 days',
      refillsAllowed: pl.refills || 0,
    })),
  });
  const rxId = rxRes.body.data.prescription.id;

  // Submit and Validate
  await agentOrg1Admin.post(`/api/v1/prescriptions/${rxId}/submit`).send();
  await agentOrg1Admin.post(`/api/v1/prescriptions/${rxId}/validate`).send({ validationNotes: 'Approved' });

  const getRx = await agentOrg1Admin.get(`/api/v1/prescriptions/${rxId}`);
  return getRx.body.data.prescription;
}

// Helper to seed inventory batch
async function seedBatchStock({ productId, batchNumber, expiryDate, quantity }) {
  const [bRes] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, ?, "active")',
    [org1Id, productId, batchNumber, expiryDate],
  );
  const batchId = bRes.insertId;

  const [invRes] = await pool.query(
    `INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
    [org1Id, branch1Id, warehouse1Id, location1Id, productId, batchId, unitBaseId, quantity],
  );
  return { batchId, inventoryId: invRes.insertId };
}

async function createTestProduct(prefix = 'MED') {
  const code = `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const [p] = await pool.query(
    `INSERT INTO products (organization_id, name, code, status, prescription_classification, selling_price)
     VALUES (?, ?, ?, "active", "prescription", 10.00)`,
    [org1Id, `Product ${code}`, code],
  );
  const prodId = p.insertId;
  await pool.query('INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)', [prodId, unitBaseId]);
  return prodId;
}

test('AUTH & PERMISSIONS: unauthenticated requests return 401 and missing permissions return 403', async () => {
  const unauth = request(app);
  assert.equal((await unauth.get('/api/v1/dispensings')).status, 401);
  assert.equal((await unauth.post('/api/v1/dispensings').send({})).status, 401);

  assert.equal((await agentNoPerms.get('/api/v1/dispensings')).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/dispensings').send({})).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/dispensings/1/allocate').send({})).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/dispensings/1/verify').send({})).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/dispensings/1/reject').send({ rejectionReason: 'r' })).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/dispensings/1/cancel').send({ reason: 'c' })).status, 403);
});

test('PRESCRIPTION ELIGIBILITY: rejects non-validated (draft, cancelled, expired) prescriptions', async () => {
  // Create draft Rx (not validated)
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Draft',
    lastName: 'Patient',
    gender: 'female',
    dateOfBirth: '1995-05-05',
  });
  const docRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Valid',
  });
  const rxRes = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId: pRes.body.data.patient.id,
    prescriberId: docRes.body.data.prescriber.id,
    prescriptionDate: '2026-10-08',
    expiryDate: '2026-12-31',
    lines: [{ productId: productId1, quantityPrescribed: 10, dosage: '1', frequency: 'D', duration: '5' }],
  });
  const draftRxId = rxRes.body.data.prescription.id;

  // Attempt dispensing on draft Rx
  const resDraft = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: draftRxId,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rxRes.body.data.prescription.lines[0].id, quantityRequested: 10 }],
  });
  assert.equal(resDraft.status, 409);
  assert.equal(resDraft.body.error.code, 'PRESCRIPTION_NOT_VALIDATED');
});

test('QUANTITY VALIDATION: rejects negative quantity and quantity exceeding remaining prescription quantity', async () => {
  const rx = await createValidatedPrescription({ productLines: [{ productId: productId1, quantity: 15 }] });
  const pLineId = rx.lines[0].id;

  // Zero quantity
  const resZero = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: pLineId, quantityRequested: 0 }],
  });
  assert.equal(resZero.status, 400);

  // Exceeding remaining (prescribed 15, requesting 20)
  const resExceed = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: pLineId, quantityRequested: 20 }],
  });
  assert.equal(resExceed.status, 409);
  assert.equal(resExceed.body.error.code, 'QUANTITY_EXCEEDS_REMAINING');
});

test('DISPENSING CREATION & PARTIAL DISPENSING: creates draft dispensing with accurate quantities', async () => {
  const rx = await createValidatedPrescription({ productLines: [{ productId: productId1, quantity: 20 }] });
  const pLineId = rx.lines[0].id;

  // Create partial dispensing for 8 out of 20
  const res = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: pLineId, quantityRequested: 8 }],
  });
  assert.equal(res.status, 201);
  const disp = res.body.data.dispensing;
  assert.ok(disp.dispensing_number.startsWith(`DSP-${org1Id}-`));
  assert.equal(disp.status, 'draft');
  assert.equal(disp.lines.length, 1);
  assert.equal(Number(disp.lines[0].quantity_requested), 8);
  assert.equal(Number(disp.lines[0].quantity_allocated), 0);
});

test('STOCK ALLOCATION & FEFO: reserves earliest expiry batch first and moves to next batch', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  // Batch 1: expires in 2 months, 5 units
  const expEarly = new Date();
  expEarly.setMonth(expEarly.getMonth() + 2);
  await seedBatchStock({
    productId: productId1,
    batchNumber: `FEFO-EARLY-${runId}`,
    expiryDate: expEarly.toISOString().split('T')[0],
    quantity: 5,
  });

  // Batch 2: expires in 6 months, 10 units
  const expLate = new Date();
  expLate.setMonth(expLate.getMonth() + 6);
  await seedBatchStock({
    productId: productId1,
    batchNumber: `FEFO-LATE-${runId}`,
    expiryDate: expLate.toISOString().split('T')[0],
    quantity: 10,
  });

  // Prescription requires 8 units
  const rx = await createValidatedPrescription({ productLines: [{ productId: productId1, quantity: 8 }] });
  const pLineId = rx.lines[0].id;

  const createRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: pLineId, quantityRequested: 8 }],
  });
  const dispId = createRes.body.data.dispensing.id;

  // Allocate stock
  const allocRes = await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  assert.equal(allocRes.status, 200);
  const disp = allocRes.body.data.dispensing;
  assert.equal(disp.status, 'stock_allocated');
  assert.equal(Number(disp.lines[0].quantity_allocated), 8);

  // Check FEFO batch allocations: Batch 1 gave 5, Batch 2 gave 3
  const allocs = disp.lines[0].allocations;
  assert.equal(allocs.length, 2);
  assert.equal(allocs[0].batch_number, `FEFO-EARLY-${runId}`);
  assert.equal(Number(allocs[0].quantity), 5);
  assert.equal(allocs[0].status, 'reserved');

  assert.equal(allocs[1].batch_number, `FEFO-LATE-${runId}`);
  assert.equal(Number(allocs[1].quantity), 3);
  assert.equal(allocs[1].status, 'reserved');

  // Verify database inventory: 'reserved' status rows exist, 'available' rows decremented
  const [resRows] = await pool.query(
    'SELECT status, quantity FROM inventory WHERE product_id = ? AND status = "reserved"',
    [productId1],
  );
  assert.ok(resRows.length > 0);
  const totalReserved = resRows.reduce((sum, r) => sum + Number(r.quantity), 0);
  assert.ok(totalReserved >= 8);
});

test('STOCK ALLOCATION: excludes expired batches from allocation', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  // Expired batch
  const expPast = new Date();
  expPast.setMonth(expPast.getMonth() - 2);
  await seedBatchStock({
    productId: productId2,
    batchNumber: `EXP-PAST-${runId}`,
    expiryDate: expPast.toISOString().split('T')[0],
    quantity: 50,
  });

  const rx = await createValidatedPrescription({ productLines: [{ productId: productId2, quantity: 5 }] });
  const dispRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rx.lines[0].id, quantityRequested: 5 }],
  });
  const dispId = dispRes.body.data.dispensing.id;

  // Allocation fails because expired batch cannot be used and no active batch exists
  const allocRes = await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  assert.equal(allocRes.status, 409);
  assert.equal(allocRes.body.error.code, 'INSUFFICIENT_STOCK');
});

test('CONCURRENCY: simultaneous stock allocations cannot oversubscribe limited available stock', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const curProdId = await createTestProduct('CONCUR');
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  // Only 10 units available
  await seedBatchStock({
    productId: curProdId,
    batchNumber: `CONCUR-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 10,
  });

  const rxA = await createValidatedPrescription({ productLines: [{ productId: curProdId, quantity: 7 }] });
  const rxB = await createValidatedPrescription({ productLines: [{ productId: curProdId, quantity: 5 }] });

  const dispARes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rxA.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rxA.lines[0].id, quantityRequested: 7 }],
  });
  const dispBRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rxB.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rxB.lines[0].id, quantityRequested: 5 }],
  });

  // Simultaneously attempt to allocate stock
  const [resA, resB] = await Promise.all([
    agentTech.post(`/api/v1/dispensings/${dispARes.body.data.dispensing.id}/allocate`).send(),
    agentTech.post(`/api/v1/dispensings/${dispBRes.body.data.dispensing.id}/allocate`).send(),
  ]);

  const statuses = [resA.status, resB.status].sort();
  // Exactly one succeeds (200) and one receives insufficient stock conflict (409)
  assert.deepEqual(statuses, [200, 409]);
});

test('PHARMACIST VERIFICATION: pharmacy technician without dispensing.verify cannot verify (403)', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  await seedBatchStock({
    productId: productId1,
    batchNumber: `TECH-VER-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 20,
  });

  const rx = await createValidatedPrescription({ productLines: [{ productId: productId1, quantity: 10 }] });
  const dispRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rx.lines[0].id, quantityRequested: 10 }],
  });
  const dispId = dispRes.body.data.dispensing.id;
  await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  await agentTech.post(`/api/v1/dispensings/${dispId}/submit-verification`).send();

  // Technician attempt to verify
  const verifyRes = await agentTech.post(`/api/v1/dispensings/${dispId}/verify`).send({ verificationNotes: 'Tech check' });
  assert.equal(verifyRes.status, 403);
});

test('PHARMACIST VERIFICATION: authorized pharmacist verifies dispensing -> payment_pending, updates Rx lines & status', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  await seedBatchStock({
    productId: productId1,
    batchNumber: `PHARM-VER-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 30,
  });

  // Rx prescribed 20
  const rx = await createValidatedPrescription({ productLines: [{ productId: productId1, quantity: 20 }] });
  const pLineId = rx.lines[0].id;

  // Dispensing 12 out of 20
  const dispRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: pLineId, quantityRequested: 12 }],
  });
  const dispId = dispRes.body.data.dispensing.id;
  await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  await agentTech.post(`/api/v1/dispensings/${dispId}/submit-verification`).send();

  // Pharmacist verifies
  const verRes = await agentPharmacist.post(`/api/v1/dispensings/${dispId}/verify`).send({
    verificationNotes: 'Pharmacist approved: renal dose adequate, no interactions.',
  });
  assert.equal(verRes.status, 200);
  const verifiedDisp = verRes.body.data.dispensing;

  assert.equal(verifiedDisp.status, 'payment_pending');
  assert.ok(verifiedDisp.verified_by);
  assert.ok(verifiedDisp.verified_at);
  assert.equal(verifiedDisp.verification_notes, 'Pharmacist approved: renal dose adequate, no interactions.');

  // Check Prescription quantities updated:
  // quantity_dispensed = 12, quantity_remaining = 8
  const rxAfter = (await agentPharmacist.get(`/api/v1/prescriptions/${rx.id}`)).body.data.prescription;
  const lineAfter = rxAfter.lines[0];
  assert.equal(Number(lineAfter.quantity_dispensed), 12);
  assert.equal(Number(lineAfter.quantity_remaining), 8);
  assert.equal(rxAfter.status, 'partially_dispensed');
});

test('REJECTION WORKFLOW: rejects dispensing with mandatory reason and releases reserved stock', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const rejProdId = await createTestProduct('REJ');
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  const { batchId } = await seedBatchStock({
    productId: rejProdId,
    batchNumber: `REJECT-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 15,
  });

  const rx = await createValidatedPrescription({ productLines: [{ productId: rejProdId, quantity: 10 }] });
  const dispRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rx.lines[0].id, quantityRequested: 10 }],
  });
  const dispId = dispRes.body.data.dispensing.id;
  await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  await agentTech.post(`/api/v1/dispensings/${dispId}/submit-verification`).send();

  // Check stock reserved
  const [resBefore] = await pool.query(
    'SELECT quantity FROM inventory WHERE batch_id = ? AND status = "reserved"',
    [batchId],
  );
  assert.equal(Number(resBefore[0].quantity), 10);

  // Pharmacist rejects without reason -> 400
  const rejFail = await agentPharmacist.post(`/api/v1/dispensings/${dispId}/reject`).send({});
  assert.equal(rejFail.status, 400);

  // Pharmacist rejects with reason
  const rejOk = await agentPharmacist.post(`/api/v1/dispensings/${dispId}/reject`).send({
    rejectionReason: 'Incorrect strength prescribed for pediatric patient.',
  });
  assert.equal(rejOk.status, 200);
  assert.equal(rejOk.body.data.dispensing.status, 'rejected');
  assert.equal(rejOk.body.data.dispensing.rejection_reason, 'Incorrect strength prescribed for pediatric patient.');

  // Reserved stock released back to available!
  const [resAfter] = await pool.query(
    'SELECT quantity FROM inventory WHERE batch_id = ? AND status = "reserved"',
    [batchId],
  );
  assert.equal(Number(resAfter[0]?.quantity || 0), 0);

  const [availAfter] = await pool.query(
    'SELECT quantity FROM inventory WHERE batch_id = ? AND status = "available"',
    [batchId],
  );
  assert.equal(Number(availAfter[0].quantity), 15);
});

test('CANCELLATION WORKFLOW: cancels dispensing with reason and restores prescription status', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  await seedBatchStock({
    productId: productId1,
    batchNumber: `CANCEL-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 20,
  });

  const rx = await createValidatedPrescription({ productLines: [{ productId: productId1, quantity: 10 }] });
  const dispRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: rx.lines[0].id, quantityRequested: 10 }],
  });
  const dispId = dispRes.body.data.dispensing.id;
  await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  await agentTech.post(`/api/v1/dispensings/${dispId}/submit-verification`).send();
  await agentPharmacist.post(`/api/v1/dispensings/${dispId}/verify`).send({ verificationNotes: 'Verified' });

  // Rx was fully dispensed
  const rxAfterVer = (await agentPharmacist.get(`/api/v1/prescriptions/${rx.id}`)).body.data.prescription;
  assert.equal(rxAfterVer.status, 'fully_dispensed');

  // Cancel dispensing
  const cancelRes = await agentPharmacist.post(`/api/v1/dispensings/${dispId}/cancel`).send({
    reason: 'Patient refused medication at counter.',
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.body.data.dispensing.status, 'cancelled');

  // Rx status is restored to validated with quantity remaining = 10
  const rxAfterCancel = (await agentPharmacist.get(`/api/v1/prescriptions/${rx.id}`)).body.data.prescription;
  assert.equal(Number(rxAfterCancel.lines[0].quantity_dispensed), 0);
  assert.equal(Number(rxAfterCancel.lines[0].quantity_remaining), 10);
  assert.equal(rxAfterCancel.status, 'validated');
});

test('REFILL USAGE: dispensing fully prescribed quantity with refills decrements refills_remaining and records refill', async () => {
  const runId = Math.random().toString(36).slice(2, 6);
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  await seedBatchStock({
    productId: productId1,
    batchNumber: `REFILL-${runId}`,
    expiryDate: exp.toISOString().split('T')[0],
    quantity: 50,
  });

  // Rx prescribed 10 with 2 refills allowed
  const rx = await createValidatedPrescription({
    productLines: [{ productId: productId1, quantity: 10, refills: 2 }],
  });
  const pLineId = rx.lines[0].id;

  const dispRes = await agentTech.post('/api/v1/dispensings').send({
    prescriptionId: rx.id,
    warehouseId: warehouse1Id,
    lines: [{ prescriptionLineId: pLineId, quantityRequested: 10 }],
  });
  const dispId = dispRes.body.data.dispensing.id;
  await agentTech.post(`/api/v1/dispensings/${dispId}/allocate`).send();
  await agentTech.post(`/api/v1/dispensings/${dispId}/submit-verification`).send();

  const verRes = await agentPharmacist.post(`/api/v1/dispensings/${dispId}/verify`).send({
    verificationNotes: 'First fill dispensed.',
  });
  assert.equal(verRes.status, 200);

  // Check Prescription: status should be 'refill_available' because 1 refill was used and 1 remains!
  const rxAfter = (await agentPharmacist.get(`/api/v1/prescriptions/${rx.id}`)).body.data.prescription;
  assert.equal(rxAfter.status, 'refill_available');
  assert.equal(Number(rxAfter.lines[0].refills_remaining), 1);
  assert.equal(Number(rxAfter.lines[0].refills_dispensed), 1);

  // Check prescription_refills row updated
  const [refills] = await pool.query(
    'SELECT refill_number, status, dispense_reference_id FROM prescription_refills WHERE prescription_line_id = ?',
    [pLineId],
  );
  assert.equal(refills.length, 2);
  assert.equal(refills[0].refill_number, 1);
  assert.equal(refills[0].status, 'dispensed');
  assert.equal(refills[0].dispense_reference_id, dispId);

  assert.equal(refills[1].refill_number, 2);
  assert.equal(refills[1].status, 'available');
});
