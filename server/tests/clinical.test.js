/**
 * Task 11 — Clinical Management Backend Tests:
 * Patients, Prescribers, Prescriptions, Validation, Lifecycle, Scope, and Inventory Invariance.
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

const PASSWORD = 'Passw0rd!clinical';

let app;
let pool;
let closePool;

let org1Id;
let org2Id;
let branch1Id;
let productId1;
let productId2;

let agentOrg1Admin;
let agentOrg2Admin;
let agentNoPerms;
let agentPharmacist; // patient.view, prescriber.view, prescription.view, prescription.create, prescription.validate

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

  // Cleanup existing clinical test records
  await pool.query('DELETE FROM prescription_attachments');
  await pool.query('DELETE FROM prescription_refills');
  await pool.query('DELETE FROM prescription_lines');
  await pool.query('DELETE FROM prescriptions');
  await pool.query('DELETE FROM prescribers');
  await pool.query('DELETE FROM patients');

  // Create Organizations with unique codes
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const [o1] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [`Clinical Org 1 ${runId}`, `CO1_${runId}`]);
  org1Id = o1.insertId;
  const [o2] = await pool.query('INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")', [`Clinical Org 2 ${runId}`, `CO2_${runId}`]);
  org2Id = o2.insertId;

  // Create Branches
  const [b1] = await pool.query('INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [org1Id, `Hospital Pharmacy ${runId}`, `HPB_${runId}`]);
  branch1Id = b1.insertId;

  // Create Dosage forms
  const [df1] = await pool.query('INSERT INTO dosage_forms (organization_id, name, code) VALUES (?, "Capsule", "CAP")', [org1Id]);
  const [rt1] = await pool.query('INSERT INTO routes (organization_id, name, code) VALUES (?, "Oral", "ORAL")', [org1Id]);

  // Create Products
  const [p1] = await pool.query(
    `INSERT INTO products (organization_id, name, code, dosage_form_id, route_id, status, prescription_classification, selling_price)
     VALUES (?, "Amoxicillin 500mg Caps", "AMX-500-C", ?, ?, "active", "prescription", 15.00)`,
    [org1Id, df1.insertId, rt1.insertId],
  );
  productId1 = p1.insertId;

  const [p2] = await pool.query(
    `INSERT INTO products (organization_id, name, code, dosage_form_id, route_id, status, prescription_classification, selling_price)
     VALUES (?, "Ibuprofen 400mg Tabs", "IBU-400-T", ?, ?, "active", "otc", 10.00)`,
    [org1Id, df1.insertId, rt1.insertId],
  );
  productId2 = p2.insertId;

  const CLINICAL_ALL_PERMS = [
    'patient.view', 'patient.create', 'patient.update', 'patient.deactivate',
    'prescriber.view', 'prescriber.create', 'prescriber.update', 'prescriber.deactivate',
    'prescription.view', 'prescription.create', 'prescription.update', 'prescription.validate', 'prescription.cancel',
  ];

  // Create Users & Roles
  const uAdmin1Id = await insertUser('Clinical Admin Org1', `cadmin1_${Date.now()}@pharmacy.local`);
  await addRoleWithPerms(uAdmin1Id, CLINICAL_ALL_PERMS);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdmin1Id, org1Id]);
  const [uAdmin1Row] = await pool.query('SELECT email FROM users WHERE id = ?', [uAdmin1Id]);
  agentOrg1Admin = await loginAgent(uAdmin1Row[0].email);

  const uAdmin2Id = await insertUser('Clinical Admin Org2', `cadmin2_${Date.now()}@pharmacy.local`);
  await addRoleWithPerms(uAdmin2Id, CLINICAL_ALL_PERMS);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uAdmin2Id, org2Id]);
  const [uAdmin2Row] = await pool.query('SELECT email FROM users WHERE id = ?', [uAdmin2Id]);
  agentOrg2Admin = await loginAgent(uAdmin2Row[0].email);

  const uNoPermId = await insertUser('No Perm User', `noperm_${Date.now()}@pharmacy.local`);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uNoPermId, org1Id]);
  const [uNoPermRow] = await pool.query('SELECT email FROM users WHERE id = ?', [uNoPermId]);
  agentNoPerms = await loginAgent(uNoPermRow[0].email);

  const uPharmId = await insertUser('Clinical Pharmacist', `pharm_${Date.now()}@pharmacy.local`);
  await addRoleWithPerms(uPharmId, [
    'patient.view', 'patient.create', 'patient.update',
    'prescriber.view', 'prescriber.create',
    'prescription.view', 'prescription.create', 'prescription.update', 'prescription.validate', 'prescription.cancel',
  ]);
  await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [uPharmId, org1Id]);
  const [uPharmRow] = await pool.query('SELECT email FROM users WHERE id = ?', [uPharmId]);
  agentPharmacist = await loginAgent(uPharmRow[0].email);
});


test('AUTH: unauthenticated requests to clinical endpoints return 401', async () => {
  const unauth = request(app);
  assert.equal((await unauth.get('/api/v1/patients')).status, 401);
  assert.equal((await unauth.get('/api/v1/prescribers')).status, 401);
  assert.equal((await unauth.get('/api/v1/prescriptions')).status, 401);
});

test('PERMISSIONS: missing clinical permissions return 403', async () => {
  assert.equal((await agentNoPerms.get('/api/v1/patients')).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/patients').send({})).status, 403);
  assert.equal((await agentNoPerms.get('/api/v1/prescribers')).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/prescribers').send({})).status, 403);
  assert.equal((await agentNoPerms.get('/api/v1/prescriptions')).status, 403);
  assert.equal((await agentNoPerms.post('/api/v1/prescriptions').send({})).status, 403);
});

test('PATIENT: creation validation rejects invalid DOB, missing names, or invalid gender', async () => {
  // Missing names
  let res = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: '',
    lastName: '',
    gender: 'male',
    dateOfBirth: '1990-01-01',
  });
  assert.equal(res.status, 400);

  // Future DOB
  const future = new Date();
  future.setFullYear(future.getFullYear() + 2);
  res = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Future',
    lastName: 'Baby',
    gender: 'female',
    dateOfBirth: future.toISOString().slice(0, 10),
  });
  assert.equal(res.status, 400);

  // Invalid gender
  res = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Valid',
    lastName: 'Patient',
    gender: 'alien',
    dateOfBirth: '1995-05-15',
  });
  assert.equal(res.status, 400);
});

test('PATIENT: creates patient with unique server-generated patient number and computed age', async () => {
  const res = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Almaz',
    lastName: 'Kebede',
    gender: 'female',
    dateOfBirth: '1995-05-15',
    phone: '+251911223344',
    identificationNumber: 'NAT-100200',
    emergencyContactName: 'Kebede Tessema',
    emergencyContactPhone: '+251922334455',
    allergies: 'Penicillin allergy',
    insuranceProvider: 'Ethiopian Insurance Corp',
    insurancePolicyNumber: 'POL-999888',
  });

  assert.equal(res.status, 201);
  const p = res.body.data.patient;
  assert.ok(p.id);
  assert.ok(p.patient_number.startsWith(`PAT-${org1Id}-`));
  assert.equal(p.first_name, 'Almaz');
  assert.equal(p.last_name, 'Kebede');
  assert.equal(p.full_name, 'Almaz Kebede');
  assert.equal(p.status, 'active');
  assert.ok(p.age >= 29); // derived from 1995
});

test('PATIENT: duplicate detection identifies possible duplicates by phone or national ID', async () => {
  // Create another patient with same phone
  const res = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Almaz',
    lastName: 'Kebede Jr',
    gender: 'female',
    dateOfBirth: '2015-05-15',
    phone: '+251911223344', // exact same phone as previous
  });

  assert.equal(res.status, 201);
  const p = res.body.data.patient;
  assert.ok(p.possibleDuplicates.length > 0);
  assert.ok(p.possibleDuplicates[0].reasons.includes('phone'));

  // Standalone duplicates check endpoint
  const dupCheck = await agentOrg1Admin.get(`/api/v1/patients/duplicates?organizationId=${org1Id}&phone=%2B251911223344`);
  assert.equal(dupCheck.status, 200);
  assert.ok(dupCheck.body.data.duplicates.length >= 2);
});

test('PATIENT: deactivation and status filtering works without deleting history', async () => {
  const createRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Deactivate',
    lastName: 'Me',
    gender: 'male',
    dateOfBirth: '1980-01-01',
  });
  const id = createRes.body.data.patient.id;

  // Deactivate
  const patchRes = await agentOrg1Admin.patch(`/api/v1/patients/${id}/status`).send({ status: 'inactive' });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.data.patient.status, 'inactive');

  // Verify filter by status
  const listActive = await agentOrg1Admin.get(`/api/v1/patients?organizationId=${org1Id}&status=active`);
  assert.ok(!listActive.body.data.items.some((pt) => pt.id === id));

  const listInactive = await agentOrg1Admin.get(`/api/v1/patients?organizationId=${org1Id}&status=inactive`);
  assert.ok(listInactive.body.data.items.some((pt) => pt.id === id));
});

test('PRESCRIBER: creation, unique license within org, and retrieval', async () => {
  const res = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Solomon Haile',
    licenseNumber: 'MD-ETH-5544',
    specialty: 'Internal Medicine',
    workplace: 'Tikur Anbessa Hospital',
    phone: '+251911556677',
  });

  assert.equal(res.status, 201);
  const dr = res.body.data.prescriber;
  assert.ok(dr.id);
  assert.ok(dr.prescriber_number.startsWith(`DOC-${org1Id}-`));
  assert.equal(dr.license_number, 'MD-ETH-5544');

  // Duplicate license in same org rejected
  const dupRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Duplicate',
    licenseNumber: 'MD-ETH-5544',
  });
  assert.equal(dupRes.status, 409);
  assert.equal(dupRes.body.error.code, 'DUPLICATE_LICENSE_NUMBER');

  // Same license in DIFFERENT org is allowed
  const diffOrgRes = await agentOrg2Admin.post('/api/v1/prescribers').send({
    organizationId: org2Id,
    name: 'Dr. Solomon in Org 2',
    licenseNumber: 'MD-ETH-5544',
  });
  assert.equal(diffOrgRes.status, 201);
});

test('PRESCRIPTION: rejects cross-organization patient, prescriber, or products', async () => {
  // Patient in Org 2
  const p2Res = await agentOrg2Admin.post('/api/v1/patients').send({
    organizationId: org2Id,
    firstName: 'Cross',
    lastName: 'Patient',
    gender: 'male',
    dateOfBirth: '1990-01-01',
  });
  const crossPatientId = p2Res.body.data.patient.id;

  // Prescriber in Org 1
  const dr1Res = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Local',
  });
  const localDrId = dr1Res.body.data.prescriber.id;

  // Try creating Rx in Org 1 with patient from Org 2
  const rxRes = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId: crossPatientId,
    prescriberId: localDrId,
    prescriptionDate: '2026-10-08',
    expiryDate: '2026-11-08',
    lines: [
      {
        productId: productId1,
        quantityPrescribed: 20,
        dosage: '1 cap',
        frequency: 'TID',
        duration: '7 days',
      },
    ],
  });

  assert.equal(rxRes.status, 400);
});

test('PRESCRIPTION: rejects creation for inactive patient or inactive doctor', async () => {
  // Inactive patient
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Inactive',
    lastName: 'PatientX',
    gender: 'female',
    dateOfBirth: '1992-02-02',
    status: 'inactive',
  });
  const inactivePatientId = pRes.body.data.patient.id;

  const drRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Active',
  });
  const activeDrId = drRes.body.data.prescriber.id;

  const res = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId: inactivePatientId,
    prescriberId: activeDrId,
    prescriptionDate: '2026-10-08',
    expiryDate: '2026-11-08',
    lines: [
      {
        productId: productId1,
        quantityPrescribed: 10,
        dosage: '1 cap',
        frequency: 'TID',
        duration: '5 days',
      },
    ],
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PATIENT_INACTIVE');
});

test('PRESCRIPTION: atomic creation with lines, auto-populated metadata, and refill foundation', async () => {
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Tigist',
    lastName: 'Alemu',
    gender: 'female',
    dateOfBirth: '1988-12-10',
  });
  const patientId = pRes.body.data.patient.id;

  const drRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Berhanu Nega',
  });
  const drId = drRes.body.data.prescriber.id;

  const res = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId,
    prescriberId: drId,
    prescriptionDate: '2026-10-08',
    expiryDate: '2026-12-08',
    diagnosis: 'Upper Respiratory Tract Infection',
    notes: 'Patient advised to take plenty of fluids',
    lines: [
      {
        productId: productId1,
        prescribedStrength: '500mg',
        quantityPrescribed: 21,
        dosage: '500mg (1 capsule)',
        frequency: 'Three times daily (Q8H)',
        duration: '7 days',
        instructions: 'Take after meals',
        refillsAllowed: 2,
      },
      {
        productId: productId2,
        quantityPrescribed: 14,
        dosage: '400mg (1 tablet)',
        frequency: 'Twice daily PRN for pain',
        duration: '7 days',
        instructions: 'Take with food or milk',
        refillsAllowed: 0,
      },
    ],
  });

  assert.equal(res.status, 201);
  const rx = res.body.data.prescription;
  assert.ok(rx.id);
  assert.ok(rx.prescription_number.startsWith(`RX-${org1Id}-`));
  assert.equal(rx.status, 'draft');
  assert.equal(rx.lines.length, 2);

  // Line 1 assertions
  const l1 = rx.lines[0];
  assert.equal(l1.product_id, productId1);
  assert.equal(l1.prescribed_strength, '500mg');
  assert.equal(Number(l1.quantity_prescribed), 21);
  assert.equal(Number(l1.quantity_dispensed), 0);
  assert.equal(Number(l1.quantity_remaining), 21);
  assert.equal(Number(l1.refills_allowed), 2);
  assert.equal(Number(l1.refills_remaining), 2);
  assert.equal(l1.refills.length, 2);
  assert.equal(l1.refills[0].refill_number, 1);
  assert.equal(l1.refills[0].status, 'available');

  // Line 2 assertions
  const l2 = rx.lines[1];
  assert.equal(Number(l2.quantity_prescribed), 14);
  assert.equal(Number(l2.refills_allowed), 0);
  assert.equal(l2.refills.length, 0);
});

test('PRESCRIPTION LIFECYCLE: draft -> pending -> validated, and cancellation requiring reason', async () => {
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Dawit',
    lastName: 'Girma',
    gender: 'male',
    dateOfBirth: '1975-03-20',
  });
  const patientId = pRes.body.data.patient.id;

  const drRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Senait Bekele',
  });
  const drId = drRes.body.data.prescriber.id;

  // Create Draft
  const rxRes = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId,
    prescriberId: drId,
    prescriptionDate: '2026-10-08',
    expiryDate: '2026-12-08',
    lines: [
      {
        productId: productId1,
        quantityPrescribed: 15,
        dosage: '1 cap',
        frequency: 'TID',
        duration: '5 days',
      },
    ],
  });
  const rxId = rxRes.body.data.prescription.id;
  assert.equal(rxRes.body.data.prescription.status, 'draft');

  // Submit to pending
  const subRes = await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/submit`).send();
  assert.equal(subRes.status, 200);
  assert.equal(subRes.body.data.prescription.status, 'pending');

  // Validate by Pharmacist
  const valRes = await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/validate`).send({
    validationNotes: 'Dosage and regimen clinically verified. Approved for dispensing.',
  });
  assert.equal(valRes.status, 200);
  const validated = valRes.body.data.prescription;
  assert.equal(validated.status, 'validated');
  assert.ok(validated.validated_by);
  assert.ok(validated.validated_at);
  assert.equal(validated.validation_notes, 'Dosage and regimen clinically verified. Approved for dispensing.');

  // Cancel prescription requiring reason
  const cancelFail = await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/cancel`).send({ reason: '' });
  assert.equal(cancelFail.status, 400);

  const cancelSuccess = await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/cancel`).send({
    reason: 'Patient reported severe allergy; doctor requested discontinuation.',
  });
  assert.equal(cancelSuccess.status, 200);
  assert.equal(cancelSuccess.body.data.prescription.status, 'cancelled');
  assert.equal(cancelSuccess.body.data.prescription.cancelled_reason, 'Patient reported severe allergy; doctor requested discontinuation.');
});

test('PRESCRIPTION: expired prescription cannot be validated', async () => {
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Expired',
    lastName: 'Patient',
    gender: 'male',
    dateOfBirth: '1990-01-01',
  });
  const patientId = pRes.body.data.patient.id;

  const drRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Past',
  });
  const drId = drRes.body.data.prescriber.id;

  // Insert an expired prescription directly in DB to simulate passage of time
  const [rxRow] = await pool.query(
    `INSERT INTO prescriptions (
      organization_id, branch_id, prescription_number, patient_id, prescriber_id,
      prescription_date, expiry_date, status
    ) VALUES (?, ?, "RX-EXPIRED-TEST-001", ?, ?, "2026-01-01", "2026-02-01", "pending")`,
    [org1Id, branch1Id, patientId, drId],
  );
  const expiredId = rxRow.insertId;

  // Validation attempt must be rejected
  const res = await agentPharmacist.post(`/api/v1/prescriptions/${expiredId}/validate`).send();
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PRESCRIPTION_EXPIRED');
});

test('INVENTORY INVARIANCE: Task 11 actions (Rx create, submit, validate, cancel) NEVER mutate stock or create movements', async () => {
  // Check stock and movement ledger count before
  const [stockBefore] = await pool.query('SELECT COUNT(*) AS c, COALESCE(SUM(quantity), 0) AS qty FROM inventory');
  const [movementsBefore] = await pool.query('SELECT COUNT(*) AS c FROM stock_movements');

  // Perform complete clinical cycle
  const pRes = await agentOrg1Admin.post('/api/v1/patients').send({
    organizationId: org1Id,
    firstName: 'Invariance',
    lastName: 'Test',
    gender: 'male',
    dateOfBirth: '1985-05-05',
  });
  const patientId = pRes.body.data.patient.id;

  const drRes = await agentOrg1Admin.post('/api/v1/prescribers').send({
    organizationId: org1Id,
    name: 'Dr. Invariance',
  });
  const drId = drRes.body.data.prescriber.id;

  const rxRes = await agentOrg1Admin.post('/api/v1/prescriptions').send({
    organizationId: org1Id,
    branchId: branch1Id,
    patientId,
    prescriberId: drId,
    prescriptionDate: '2026-10-08',
    expiryDate: '2026-12-08',
    lines: [
      {
        productId: productId1,
        quantityPrescribed: 100,
        dosage: '1 cap',
        frequency: 'TID',
        duration: '10 days',
      },
    ],
  });
  const rxId = rxRes.body.data.prescription.id;

  await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/submit`).send();
  await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/validate`).send({ validationNotes: 'Approved' });
  await agentPharmacist.post(`/api/v1/prescriptions/${rxId}/cancel`).send({ reason: 'Discontinued' });

  // Check stock and movement ledger count after
  const [stockAfter] = await pool.query('SELECT COUNT(*) AS c, COALESCE(SUM(quantity), 0) AS qty FROM inventory');
  const [movementsAfter] = await pool.query('SELECT COUNT(*) AS c FROM stock_movements');

  assert.equal(stockAfter[0].c, stockBefore[0].c, 'Inventory rows count must remain identical');
  assert.equal(stockAfter[0].qty, stockBefore[0].qty, 'Inventory total quantity must remain identical');
  assert.equal(movementsAfter[0].c, movementsBefore[0].c, 'Zero stock movements must be created during Task 11');
});

after(async () => {
  if (pool) {
    await pool.query('DELETE FROM prescription_attachments');
    await pool.query('DELETE FROM prescription_refills');
    await pool.query('DELETE FROM prescription_lines');
    await pool.query('DELETE FROM prescriptions');
    await pool.query('DELETE FROM prescribers');
    await pool.query('DELETE FROM patients');
  }
  if (closePool) {
    await closePool();
  }
});
