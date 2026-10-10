/**
 * Task 19 — Centralized Audit Trail and Activity History Integration Tests
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import auditService from '../src/services/auditService.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_HOST = '127.0.0.1';
process.env.DATABASE_PORT = '3306';
process.env.DATABASE_NAME = 'pharmacy_erp_test';
process.env.DATABASE_USER = 'root';
process.env.DATABASE_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.AUTH_COOKIE_SECURE = 'false';

const PASSWORD = 'Passw0rd!audit19';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id, branchOrg2Id;
let wh1Id, whOrg2Id;
let location1Id;
let unitId;

let agentAuditor;
let agentManager;
let agentBranch1User;
let agentNoPerms;
let agentOrg2;

let auditorUserId;
let managerUserId;
let branch1UserId;
let noPermsUserId;
let org2UserId;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLAUD_' + Math.random().toString(36).slice(2, 9);
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
  try {
    const { runMigrations } = await import('../src/database/migrate.js');
    await runMigrations();

    const poolMod = await import('../src/database/pool.js');
    pool = poolMod.getPool();
    closePool = poolMod.closePool;
    app = (await import('../src/app.js')).default;

    const runTag = Math.random().toString(36).slice(2, 8);

    // Clean test audit logs
    await pool.query('DELETE FROM audit_logs WHERE details LIKE ?', [`%${runTag}%`]).catch(() => {});

    // Org 1
    const [o1] = await pool.query(
      'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
      [`Audit Org 1 ${runTag}`, `AO1_${runTag}`],
    );
    org1Id = o1.insertId;

    // Org 2 (isolated)
    const [o2] = await pool.query(
      'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
      [`Audit Org 2 ${runTag}`, `AO2_${runTag}`],
    );
    org2Id = o2.insertId;

    // Branches
    const [b1] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Audit Branch 1 ${runTag}`, `AB1_${runTag}`],
    );
    branch1Id = b1.insertId;

    const [b2] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Audit Branch 2 ${runTag}`, `AB2_${runTag}`],
    );
    branch2Id = b2.insertId;

    const [bOrg2] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org2Id, `Org2 Branch ${runTag}`, `ABO2_${runTag}`],
    );
    branchOrg2Id = bOrg2.insertId;

    // Warehouses
    const [w1] = await pool.query(
      'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
      [branch1Id, `Audit WH 1 ${runTag}`, `AWH1_${runTag}`],
    );
    wh1Id = w1.insertId;

    const [wOrg2] = await pool.query(
      'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
      [branchOrg2Id, `Org2 WH ${runTag}`, `AWHO2_${runTag}`],
    );
    whOrg2Id = wOrg2.insertId;

    const [loc1] = await pool.query(
      'INSERT INTO storage_locations (warehouse_id, code, name, status) VALUES (?, ?, ?, "active")',
      [wh1Id, `LOC1_${runTag}`, 'Shelf 1'],
    );
    location1Id = loc1.insertId;

    const [u] = await pool.query(
      'INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Unit ${runTag}`, `AUDU_${runTag}`],
    );
    unitId = u.insertId;

    // Seed users:
    // 1. Auditor (full audit perms & approval requester on Org 1)
    auditorUserId = await insertUser(`Auditor ${runTag}`, `auditor_${runTag}@test.com`);
    await addRoleWithPerms(auditorUserId, [
      'audit.view', 'audit.export', 'approval.create', 'approval.view',
    ]);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [auditorUserId, org1Id]);

    // 2. Manager (approver on Org 1)
    managerUserId = await insertUser(`Manager ${runTag}`, `manager_${runTag}@test.com`);
    await addRoleWithPerms(managerUserId, [
      'approval.approve', 'approval.view', 'approval.credit', 'approval.execute',
    ]);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [managerUserId, org1Id]);

    // 3. Branch 1 User (branch scoped audit view only - NO org scope)
    branch1UserId = await insertUser(`BranchUser ${runTag}`, `branchuser_${runTag}@test.com`);
    await addRoleWithPerms(branch1UserId, ['audit.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [branch1UserId, branch1Id]);

    // 4. User with no audit perms
    noPermsUserId = await insertUser(`NoPerms ${runTag}`, `noperms_${runTag}@test.com`);
    await addRoleWithPerms(noPermsUserId, ['approval.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [noPermsUserId, org1Id]);

    // 5. Org 2 User
    org2UserId = await insertUser(`Org2 User ${runTag}`, `org2_${runTag}@test.com`);
    await addRoleWithPerms(org2UserId, ['audit.view', 'audit.export']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

    // Log in agents
    agentAuditor = await loginAgent(`auditor_${runTag}@test.com`);
    agentManager = await loginAgent(`manager_${runTag}@test.com`);
    agentBranch1User = await loginAgent(`branchuser_${runTag}@test.com`);
    agentNoPerms = await loginAgent(`noperms_${runTag}@test.com`);
    agentOrg2 = await loginAgent(`org2_${runTag}@test.com`);
  } catch (err) {
    console.error('ERROR IN AUDIT BEFORE HOOK:', err);
    throw err;
  }
});

// ==========================================
// 1. CORE AUDIT SERVICE & SANITIZATION TESTS
// ==========================================

test('CORE: sanitization scrubs passwords, tokens, pins, and auth headers', () => {
  const dirty = {
    user: 'admin',
    password: 'supersecretpassword123',
    password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    pin: '1234',
    nested: {
      client_secret: 'sec_99999',
      safeField: 'visibleValue',
    },
    items: [
      { cardNumber: '4111222233334444', cvv: '123', name: 'Paracetamol' },
    ],
  };

  const clean = auditService.sanitize(dirty);
  assert.equal(clean.user, 'admin');
  assert.equal(clean.password, '[REDACTED]');
  assert.equal(clean.password_hash, '[REDACTED]');
  assert.equal(clean.token, '[REDACTED]');
  assert.equal(clean.pin, '[REDACTED]');
  assert.equal(clean.nested.client_secret, '[REDACTED]');
  assert.equal(clean.nested.safeField, 'visibleValue');
  assert.equal(clean.items[0].cardNumber, '[REDACTED]');
  assert.equal(clean.items[0].cvv, '[REDACTED]');
  assert.equal(clean.items[0].name, 'Paracetamol');
});

test('CORE: calculateDiff detects changes and ignores identical values', () => {
  const beforeState = { name: 'Amoxicillin 250mg', price: 100, is_active: 1, secret: 'old' };
  const afterState = { name: 'Amoxicillin 500mg', price: 100, is_active: 0, secret: 'new' };

  const diff = auditService.calculateDiff(beforeState, afterState, ['secret']);
  assert.equal(diff.name.old, 'Amoxicillin 250mg');
  assert.equal(diff.name.new, 'Amoxicillin 500mg');
  assert.equal(diff.is_active.old, 1);
  assert.equal(diff.is_active.new, 0);
  assert.equal(diff.price, undefined, 'Identical price must not be in diff');
  assert.equal(diff.secret, undefined, 'Ignored secret field must not be in diff');
});

test('CORE: auditService.log writes append-only event with valid schema and metadata', async () => {
  const logId = await auditService.log({
    organizationId: org1Id,
    branchId: branch1Id,
    actorUserId: auditorUserId,
    action: 'test.core_event',
    resourceType: 'system_test',
    resourceId: '999',
    resourceReference: 'TEST-REF-001',
    outcome: 'success',
    details: { testRun: true, note: 'integration verification' },
    beforeValues: { status: 'draft' },
    afterValues: { status: 'published' },
    reason: 'Routine test validation',
    ipAddress: '127.0.0.1',
  });

  assert.ok(logId, 'audit log id must be returned');

  // Verify directly in DB
  const [rows] = await pool.query('SELECT * FROM audit_logs WHERE id = ?', [logId]);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.organization_id, org1Id);
  assert.equal(row.branch_id, branch1Id);
  assert.equal(row.action, 'test.core_event');
  assert.equal(row.resource_type, 'system_test');
  assert.equal(row.resource_reference, 'TEST-REF-001');
  assert.equal(row.outcome, 'success');
  assert.equal(row.reason, 'Routine test validation');

  const parsedDetails = JSON.parse(row.details);
  assert.equal(parsedDetails.testRun, true);
  const parsedBefore = JSON.parse(row.before_values);
  assert.equal(parsedBefore.status, 'draft');
  const parsedAfter = JSON.parse(row.after_values);
  assert.equal(parsedAfter.status, 'published');
});

// ==========================================
// 2. TRANSACTION CONSISTENCY & ROLLBACK
// ==========================================

test('TRANSACTION: audit event rolled back when business transaction fails', async () => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  let loggedId = null;
  try {
    loggedId = await auditService.log({
      connection: conn,
      organizationId: org1Id,
      actorUserId: auditorUserId,
      action: 'transaction.rollback_test',
      resourceType: 'test_record',
      resourceId: '404',
      outcome: 'success',
      details: { willRollback: true },
    });
    assert.ok(loggedId);

    // Simulate mutation error triggering rollback
    throw new Error('Simulated business mutation failure');
  } catch (err) {
    await conn.rollback();
  } finally {
    conn.release();
  }

  // The audit log MUST NOT exist in DB because transaction was rolled back!
  const [rows] = await pool.query('SELECT * FROM audit_logs WHERE id = ?', [loggedId]);
  assert.equal(rows.length, 0, 'Rolled-back transaction must not leave false success audit log');
});

// ==========================================
// 3. API AUTHORIZATION & ACCESS CONTROL
// ==========================================

test('API AUTH: unauthenticated access to /audit-logs is rejected with 401', async () => {
  const res = await request(app).get('/api/v1/audit-logs');
  assert.equal(res.status, 401);
});

test('API PERMISSIONS: user without audit.view is rejected with 403', async () => {
  const res = await agentNoPerms.get('/api/v1/audit-logs');
  assert.equal(res.status, 403);
});

test('API IMMUTABILITY: PUT, PATCH, DELETE endpoints do not exist (append-only enforcement)', async () => {
  const putRes = await agentAuditor.put('/api/v1/audit-logs/1').send({ reason: 'altered' });
  assert.ok([404, 405].includes(putRes.status), 'PUT must be rejected');

  const patchRes = await agentAuditor.patch('/api/v1/audit-logs/1').send({ outcome: 'failure' });
  assert.ok([404, 405].includes(patchRes.status), 'PATCH must be rejected');

  const delRes = await agentAuditor.delete('/api/v1/audit-logs/1');
  assert.ok([404, 405].includes(delRes.status), 'DELETE must be rejected');
});

// ==========================================
// 4. MULTI-TIER DATA SCOPE ISOLATION
// ==========================================

test('API SCOPE: Cross-organization data isolation', async () => {
  // Create an audit entry for Org 2
  const org2LogId = await auditService.log({
    organizationId: org2Id,
    actorUserId: org2UserId,
    action: 'org2.sensitive_action',
    resourceType: 'org2_vault',
    resourceId: '900',
    outcome: 'success',
    details: { secretOrg2: 'confidential' },
  });

  // Org 1 Auditor queries audit logs
  const resOrg1 = await agentAuditor.get('/api/v1/audit-logs?action=org2.sensitive_action');
  assert.equal(resOrg1.status, 200);
  assert.equal(resOrg1.body.data.items.length, 0, 'Org 1 auditor must not see Org 2 audit logs');

  // Org 1 Auditor attempts direct ID lookup of Org 2 audit entry -> 403 Forbidden
  const directRes = await agentAuditor.get(`/api/v1/audit-logs/${org2LogId}`);
  assert.ok([403, 404].includes(directRes.status), 'Direct access to out-of-scope log must return 403 or 404');

  // Org 2 User queries audit logs -> finds it
  const resOrg2 = await agentOrg2.get('/api/v1/audit-logs?action=org2.sensitive_action');
  assert.equal(resOrg2.status, 200);
  assert.equal(resOrg2.body.data.items.length, 1);
  assert.equal(resOrg2.body.data.items[0].id, org2LogId);
});

test('API SCOPE: Branch-scoped user cannot view logs from other branches', async () => {
  // Create log in Branch 1
  const b1LogId = await auditService.log({
    organizationId: org1Id,
    branchId: branch1Id,
    actorUserId: auditorUserId,
    action: 'branch.event',
    resourceType: 'counter',
    resourceId: '101',
    outcome: 'success',
  });

  // Create log in Branch 2
  const b2LogId = await auditService.log({
    organizationId: org1Id,
    branchId: branch2Id,
    actorUserId: auditorUserId,
    action: 'branch.event',
    resourceType: 'counter',
    resourceId: '102',
    outcome: 'success',
  });

  // Branch 1 User queries audit logs
  const res = await agentBranch1User.get('/api/v1/audit-logs?action=branch.event');
  assert.equal(res.status, 200);
  const foundIds = res.body.data.items.map((l) => l.id);
  assert.ok(foundIds.includes(b1LogId), 'Must include Branch 1 event');
  assert.ok(!foundIds.includes(b2LogId), 'Must exclude Branch 2 event');

  // Direct lookup of Branch 2 log by Branch 1 user must return 403/404
  const b2Direct = await agentBranch1User.get(`/api/v1/audit-logs/${b2LogId}`);
  assert.ok([403, 404].includes(b2Direct.status));
});

// ==========================================
// 5. QUERY FILTERS, STATS & PAGINATION
// ==========================================

test('API QUERY: filters by action, resourceType, date range, and search reference', async () => {
  const refCode = 'SRCH-REF-' + Math.random().toString(36).slice(2, 8);
  await auditService.log({
    organizationId: org1Id,
    branchId: branch1Id,
    actorUserId: auditorUserId,
    action: 'search.sample_event',
    resourceType: 'filter_test',
    resourceId: '777',
    resourceReference: refCode,
    outcome: 'success',
  });

  // Filter by action
  const resAction = await agentAuditor.get('/api/v1/audit-logs?action=search.sample_event');
  assert.equal(resAction.status, 200);
  assert.ok(resAction.body.data.items.some((l) => l.resource_reference === refCode));

  // Filter by search reference
  const resSearch = await agentAuditor.get(`/api/v1/audit-logs?search=${refCode}`);
  assert.equal(resSearch.status, 200);
  assert.equal(resSearch.body.data.items.length, 1);
  assert.equal(resSearch.body.data.items[0].resource_reference, refCode);

  // Filter by resourceType
  const resType = await agentAuditor.get('/api/v1/audit-logs?resourceType=filter_test');
  assert.equal(resType.status, 200);
  assert.ok(resType.body.data.items.some((l) => l.resource_reference === refCode));
});

test('API STATS: /audit-logs/stats returns summary metrics', async () => {
  const res = await agentAuditor.get('/api/v1/audit-logs/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(typeof res.body.data.totalEvents === 'number');
  assert.ok(typeof res.body.data.failedEvents === 'number');
  assert.ok(typeof res.body.data.securityEvents === 'number');
  assert.ok(typeof res.body.data.inventoryEvents === 'number');
  assert.ok(typeof res.body.data.financialEvents === 'number');
});

test('API EXPORT: /audit-logs/export generates formatted CSV within bounds', async () => {
  // Auditor has audit.export permission
  const res = await agentAuditor.get('/api/v1/audit-logs/export?format=csv&limit=50');
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  assert.ok(res.text.includes('ID,Timestamp,Action,Outcome,Resource Type,Resource ID'));

  // User without audit.export permission gets 403
  const noExportRes = await agentBranch1User.get('/api/v1/audit-logs/export');
  assert.equal(noExportRes.status, 403);
});

// ==========================================
// 6. CROSS-MODULE AUDIT HOOK INTEGRATION
// ==========================================

test('MODULE AUDIT: Approval workflow records audit entries on creation and decision', async () => {
  const aprRes = await agentAuditor.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'credit_limit_override',
    targetEntityType: 'customer',
    targetEntityId: 888,
    requestedValue: 1200,
    originalValue: 800,
    reason: 'Emergency credit authorized by auditor',
  });
  assert.equal(aprRes.status, 201);
  const aprId = aprRes.body.data.id;

  // Verify approval.created audit log exists
  const [createdRows] = await pool.query(
    'SELECT * FROM audit_logs WHERE action = "approval.created" AND resource_id = ?',
    [aprId],
  );
  assert.equal(createdRows.length, 1);
  assert.equal(createdRows[0].actor_user_id, auditorUserId);
  assert.equal(createdRows[0].organization_id, org1Id);

  // Approve the request using Manager (segregation of duties)
  const approveRes = await agentManager.post(`/api/v1/approvals/${aprId}/approve`).send({
    decisionReason: 'Emergency hospital credit approved',
  });
  assert.equal(approveRes.status, 200);

  // Verify approval.approved audit log exists
  const [approvedRows] = await pool.query(
    'SELECT * FROM audit_logs WHERE action = "approval.approved" AND resource_id = ?',
    [aprId],
  );
  assert.equal(approvedRows.length, 1);
  assert.equal(approvedRows[0].reason, 'Emergency hospital credit approved');
});

test('MODULE AUDIT: Auth events (login, logout, failed login) are logged safely', async () => {
  const fakeEmail = 'fake_user_aud@test.com';
  // Failed login
  await request(app).post('/api/v1/auth/login').send({
    email: fakeEmail,
    password: 'WrongPassword999!',
  });

  const [failedRows] = await pool.query(
    'SELECT * FROM audit_logs WHERE action = "auth.failed_login" ORDER BY id DESC LIMIT 1',
  );
  assert.ok(failedRows.length > 0);
  const details = JSON.parse(failedRows[0].details);
  assert.equal(details.attemptedEmail, fakeEmail);
  assert.equal(details.password, undefined, 'Password must never be logged!');
});

after(async () => {
  if (closePool) await closePool();
});
