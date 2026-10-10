/**
 * Task 20 — Centralized Notifications and User Alerts Integration Tests
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import notificationService from '../src/services/notificationService.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_HOST = '127.0.0.1';
process.env.DATABASE_PORT = '3306';
process.env.DATABASE_NAME = 'pharmacy_erp_test';
process.env.DATABASE_USER = 'root';
process.env.DATABASE_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.AUTH_COOKIE_SECURE = 'false';

const PASSWORD = 'Passw0rd!notif20';

let app;
let pool;
let closePool;

let org1Id, org2Id;
let branch1Id, branch2Id, branchOrg2Id;
let wh1Id;
let location1Id;
let unitId;

let agentUserA;
let agentUserB;
let agentApprover;
let agentBranch1User;
let agentOrg2User;

let userAId;
let userBId;
let approverUserId;
let branch1UserId;
let org2UserId;

async function insertUser(name, email) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, await bcrypt.hash(PASSWORD, 10), 'active'],
  );
  return r.insertId;
}

async function addRoleWithPerms(userId, codes) {
  const code = 'ROLNOT_' + Math.random().toString(36).slice(2, 9);
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

    // Org 1
    const [o1] = await pool.query(
      'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
      [`Notif Org 1 ${runTag}`, `NO1_${runTag}`],
    );
    org1Id = o1.insertId;

    // Org 2 (isolated)
    const [o2] = await pool.query(
      'INSERT INTO organizations (name, code, status) VALUES (?, ?, "active")',
      [`Notif Org 2 ${runTag}`, `NO2_${runTag}`],
    );
    org2Id = o2.insertId;

    // Branches
    const [b1] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Notif Branch 1 ${runTag}`, `NB1_${runTag}`],
    );
    branch1Id = b1.insertId;

    const [b2] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Notif Branch 2 ${runTag}`, `NB2_${runTag}`],
    );
    branch2Id = b2.insertId;

    const [bOrg2] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org2Id, `Org2 Branch ${runTag}`, `NBO2_${runTag}`],
    );
    branchOrg2Id = bOrg2.insertId;

    // Warehouses
    const [w1] = await pool.query(
      'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
      [branch1Id, `Notif WH 1 ${runTag}`, `NWH1_${runTag}`],
    );
    wh1Id = w1.insertId;

    const [loc1] = await pool.query(
      'INSERT INTO storage_locations (warehouse_id, code, name, status) VALUES (?, ?, ?, "active")',
      [wh1Id, `LOC_${runTag}`, 'Shelf A'],
    );
    location1Id = loc1.insertId;

    const [u] = await pool.query(
      'INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [org1Id, `Unit ${runTag}`, `NU_${runTag}`],
    );
    unitId = u.insertId;

    // Users
    // 1. User A (Org 1, general user / approval requester)
    userAId = await insertUser(`User A ${runTag}`, `userA_${runTag}@test.com`);
    await addRoleWithPerms(userAId, ['notification.view', 'approval.create', 'approval.view', 'inventory.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [userAId, org1Id]);

    // 2. User B (Org 1, peer user)
    userBId = await insertUser(`User B ${runTag}`, `userB_${runTag}@test.com`);
    await addRoleWithPerms(userBId, ['notification.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [userBId, org1Id]);

    // 3. Approver (Org 1, discount and credit approver)
    approverUserId = await insertUser(`Approver ${runTag}`, `approver_${runTag}@test.com`);
    await addRoleWithPerms(approverUserId, ['notification.view', 'approval.approve', 'approval.view', 'approval.credit', 'quarantine.view', 'quarantine.create']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [approverUserId, org1Id]);

    // 4. Branch 1 Only User (Branch scope only)
    branch1UserId = await insertUser(`Branch1 User ${runTag}`, `b1user_${runTag}@test.com`);
    await addRoleWithPerms(branch1UserId, ['notification.view', 'stock_transfer.view', 'quarantine.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, "branch", ?)', [branch1UserId, branch1Id]);

    // 5. Org 2 User
    org2UserId = await insertUser(`Org2 User ${runTag}`, `org2user_${runTag}@test.com`);
    await addRoleWithPerms(org2UserId, ['notification.view']);
    await pool.query('INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)', [org2UserId, org2Id]);

    // Log in agents
    agentUserA = await loginAgent(`userA_${runTag}@test.com`);
    agentUserB = await loginAgent(`userB_${runTag}@test.com`);
    agentApprover = await loginAgent(`approver_${runTag}@test.com`);
    agentBranch1User = await loginAgent(`b1user_${runTag}@test.com`);
    agentOrg2User = await loginAgent(`org2user_${runTag}@test.com`);
  } catch (err) {
    console.error('ERROR IN NOTIFICATIONS BEFORE HOOK:', err);
    throw err;
  }
});

// ==========================================
// 1. CORE SERVICE & SANITIZATION TESTS
// ==========================================

test('CORE: sanitization strips HTML tags, passwords, cards, and pins from notifications', () => {
  const dirty = 'Alert: <b>Critical</b> password=secret123 card: 4111-2222-3333-4444 pin=9876';
  const clean = notificationService.sanitizeText(dirty);
  assert.equal(clean.includes('<b>'), false, 'HTML tags must be stripped');
  assert.equal(clean.includes('secret123'), false, 'Password must be redacted');
  assert.equal(clean.includes('4111-2222-3333-4444'), false, 'Card number must be redacted');
  assert.equal(clean.includes('9876'), false, 'Pin must be redacted');
  assert.ok(clean.includes('[REDACTED]'), 'Must contain [REDACTED] placeholders');
});

test('CORE: notificationService.prepareNotification validates required parameters', () => {
  assert.throws(
    () => {
      notificationService.prepareNotification({
        userId: userAId,
        organizationId: null, // missing orgId
        type: 'test_type',
        title: 'Title',
        message: 'Message',
      });
    },
    /organizationId is required/,
  );
  assert.throws(
    () => {
      notificationService.prepareNotification({
        userId: null,
        organizationId: org1Id,
        type: 'test_type',
        title: 'Title',
        message: 'Message',
      });
    },
    /userId is required/,
  );
});

test('CORE: notifyUsers creates notifications with correct properties and defaults', async () => {
  const ids = await notificationService.notifyUsers({
    userIds: [userAId],
    organizationId: org1Id,
    branchId: branch1Id,
    type: 'system_announcement',
    title: 'Routine Maintenance Notice',
    message: 'System upgrade scheduled for tonight at 23:00.',
    severity: 'info',
    resourceType: 'system',
    actionUrl: '/status',
  });

  assert.equal(ids.length, 1);
  const notif = await notificationService.getNotificationById(ids[0], userAId);
  assert.equal(notif.user_id, userAId);
  assert.equal(notif.organization_id, org1Id);
  assert.equal(notif.branch_id, branch1Id);
  assert.equal(notif.type, 'system_announcement');
  assert.equal(notif.title, 'Routine Maintenance Notice');
  assert.equal(notif.severity, 'info');
  assert.equal(notif.is_read, false);
  assert.equal(notif.action_url, '/status');
});

test('CORE: deduplication ensures repeated dispatch does not create duplicate notifications', async () => {
  const dedupKey = 'unique_event_' + Math.random().toString(36).slice(2, 9);

  // First call
  const ids1 = await notificationService.notifyUsers({
    userIds: [userAId],
    organizationId: org1Id,
    type: 'dedup_test',
    title: 'Event First Call',
    message: 'Initial dispatch',
    dedupKey,
  });
  assert.equal(ids1.length, 1);

  // Second call with same dedupKey
  const ids2 = await notificationService.notifyUsers({
    userIds: [userAId],
    organizationId: org1Id,
    type: 'dedup_test',
    title: 'Event Second Call (Retry)',
    message: 'Retry dispatch',
    dedupKey,
  });

  // Second call must return same ID or not create duplicate row
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND dedup_key = ?',
    [userAId, `${dedupKey}:user:${userAId}`],
  );
  assert.equal(Number(rows[0].cnt), 1, 'Only exactly 1 notification must exist for the dedup key');
});

test('CORE: recipient resolution by permission discovers authorized users in scope', async () => {
  // approverUserId has approval.credit in Org 1
  // userAId does NOT have approval.credit
  const tag = Math.random().toString(36).slice(2, 7);
  const ids = await notificationService.notifyByPermission({
    organizationId: org1Id,
    branchId: branch1Id,
    permission: 'approval.credit',
    excludeUserIds: [userAId],
    type: 'credit_override_test',
    title: `Credit Override Needed ${tag}`,
    message: 'Customer requested 5,000 ETB limit extension.',
    severity: 'warning',
  });

  assert.ok(ids.length > 0, 'Must dispatch to at least 1 approver');

  // Verify approver received it
  const approverNotifs = await notificationService.listUserNotifications(approverUserId, {
    search: tag,
  });
  assert.ok(approverNotifs.items.some((n) => n.title.includes(tag)));

  // Verify userA did NOT receive it
  const userANotifs = await notificationService.listUserNotifications(userAId, {
    search: tag,
  });
  assert.equal(userANotifs.items.length, 0, 'Requester must not receive the notification');
});

test('TRANSACTION: notifications roll back cleanly when business transaction fails', async () => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  let createdId = null;
  try {
    const ids = await notificationService.notifyUsers({
      userIds: [userAId],
      organizationId: org1Id,
      type: 'trans_test',
      title: 'Rollback Notification Test',
      message: 'This notification should be rolled back.',
      connection: conn,
    });
    createdId = ids[0];
    assert.ok(createdId);

    // Simulated transaction error
    throw new Error('Forced mutation rollback');
  } catch (err) {
    await conn.rollback();
  } finally {
    conn.release();
  }

  // The notification MUST NOT exist in DB
  const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [createdId]);
  assert.equal(rows.length, 0, 'Rolled-back transaction must leave no ghost notification');
});

// ==========================================
// 2. API ENDPOINTS & ACCESS CONTROL TESTS
// ==========================================

test('API AUTH: unauthenticated access to /notifications is rejected with 401', async () => {
  const res = await request(app).get('/api/v1/notifications');
  assert.equal(res.status, 401);
});

test('API QUERY: user can list their notifications and get unread count', async () => {
  // Create an unread notification for User A
  await notificationService.notifyUsers({
    userIds: [userAId],
    organizationId: org1Id,
    type: 'query_test',
    title: 'Query Test Notification',
    message: 'Testing API query capabilities.',
  });

  // Query /notifications
  const resList = await agentUserA.get('/api/v1/notifications');
  assert.equal(resList.status, 200);
  assert.equal(resList.body.success, true);
  assert.ok(Array.isArray(resList.body.data.items));
  assert.ok(typeof resList.body.data.total === 'number');
  assert.ok(typeof resList.body.data.unreadCount === 'number');

  // Query /notifications/unread-count
  const resCount = await agentUserA.get('/api/v1/notifications/unread-count');
  assert.equal(resCount.status, 200);
  assert.ok(resCount.body.data.unreadCount >= 1);
});

test('API PRIVACY: User A cannot read or mark User B notification as read', async () => {
  // Create notification for User B
  const [bNotifId] = await notificationService.notifyUsers({
    userIds: [userBId],
    organizationId: org1Id,
    type: 'private_test',
    title: 'Private to User B',
    message: 'User A should never see this.',
  });

  // User A attempts GET /notifications/:id of User B's notification -> 404
  const resGet = await agentUserA.get(`/api/v1/notifications/${bNotifId}`);
  assert.equal(resGet.status, 404, 'Must not access other user notification');

  // User A attempts PATCH /notifications/:id/read -> 404
  const resPatch = await agentUserA.patch(`/api/v1/notifications/${bNotifId}/read`);
  assert.equal(resPatch.status, 404, 'Must not mutate other user notification read state');

  // User B can access their own notification
  const resGetB = await agentUserB.get(`/api/v1/notifications/${bNotifId}`);
  assert.equal(resGetB.status, 200);
  assert.equal(resGetB.body.data.id, bNotifId);
});

test('API ACTIONS: marking single notification and mark-all-read behavior', async () => {
  // Create two unread notifications for User B
  const [id1, id2] = await notificationService.notifyUsers({
    userIds: [userBId, userBId],
    organizationId: org1Id,
    type: 'action_test',
    title: 'Action Notification',
    message: 'Testing read state mutations.',
  });

  // Mark single as read
  const resSingle = await agentUserB.patch(`/api/v1/notifications/${id1}/read`);
  assert.equal(resSingle.status, 200);
  assert.equal(resSingle.body.data.is_read, true);
  assert.ok(resSingle.body.data.read_at);

  // Mark all as read
  const resAll = await agentUserB.patch('/api/v1/notifications/read-all');
  assert.equal(resAll.status, 200);
  assert.equal(resAll.body.data.unreadCount, 0);

  // Unread count should now be 0 for User B
  const resUnread = await agentUserB.get('/api/v1/notifications/unread-count');
  assert.equal(resUnread.body.data.unreadCount, 0);
});

// ==========================================
// 3. WORKFLOW INTEGRATION TESTS
// ==========================================

test('INTEGRATION: Approval request creation notifies authorized approvers', async () => {
  const aprRes = await agentUserA.post('/api/v1/approvals').send({
    organizationId: org1Id,
    branchId: branch1Id,
    category: 'credit_limit_override',
    targetEntityType: 'customer',
    targetEntityId: 555,
    requestedValue: 2500,
    originalValue: 1000,
    reason: 'Emergency credit authorized by User A',
  });
  assert.equal(aprRes.status, 201);
  const aprId = aprRes.body.data.id;
  const aprNumber = aprRes.body.data.request_number;

  // Verify approver received notification
  const approverList = await agentApprover.get(`/api/v1/notifications?search=${aprNumber}`);
  assert.equal(approverList.status, 200);
  assert.ok(approverList.body.data.items.length >= 1);
  const notif = approverList.body.data.items[0];
  assert.equal(notif.type, 'approval_pending');
  assert.equal(notif.resource_id, aprId);
  assert.equal(notif.severity, 'warning');

  // Approve the request
  const approveRes = await agentApprover.post(`/api/v1/approvals/${aprId}/approve`).send({
    decisionReason: 'Credit approved for hospital supplies',
  });
  assert.equal(approveRes.status, 200);

  // Verify User A (requester) received the approved notification!
  const requesterList = await agentUserA.get(`/api/v1/notifications?search=${aprNumber}`);
  assert.equal(requesterList.status, 200);
  const decisionNotif = requesterList.body.data.items.find((n) => n.type === 'approval_decision');
  assert.ok(decisionNotif, 'Requester must receive approval decision notification');
  assert.equal(decisionNotif.severity, 'success');
  assert.equal(decisionNotif.title, 'Approval Request Approved');
});

test('INTEGRATION: Quarantine hold creation notifies authorized quarantine supervisors', async () => {
  // Create product and batch for quarantine
  const [p] = await pool.query(
    'INSERT INTO products (organization_id, name, code, prescription_classification, status) VALUES (?, "Notif Test Med", "NTM-01", "otc", "active")',
    [org1Id],
  );
  const [b] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, "BAT-NOTIF-01", DATE_ADD(CURDATE(), INTERVAL 1 YEAR), "active")',
    [org1Id, p.insertId],
  );
  await pool.query(
    'INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?, 50, "available")',
    [org1Id, branch1Id, wh1Id, location1Id, p.insertId, b.insertId, unitId],
  );

  const qRes = await agentApprover.post('/api/v1/quarantines').send({
    organizationId: org1Id,
    branchId: branch1Id,
    warehouseId: wh1Id,
    storageLocationId: location1Id,
    productId: p.insertId,
    batchId: b.insertId,
    unitId,
    quantity: 10,
    sourceType: 'inspection',
    reason: 'Suspicious packaging integrity',
  });
  assert.equal(qRes.status, 201);
  const qNumber = qRes.body.data.quarantine_number;

  // Verify branch1User received quarantine notification
  const b1List = await agentBranch1User.get(`/api/v1/notifications?search=${qNumber}`);
  assert.equal(b1List.status, 200);
  assert.ok(b1List.body.data.items.some((n) => n.type === 'quarantine_alert'));
});

test('INTEGRATION: scanAlerts triggers low-stock and expiry notifications without flood', async () => {
  // Create low stock product
  const [lowProd] = await pool.query(
    'INSERT INTO products (organization_id, name, code, reorder_level, prescription_classification, status) VALUES (?, "Low Stock Drug", "LSD-01", 100, "otc", "active")',
    [org1Id],
  );
  const [lowBatch] = await pool.query(
    'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, "BAT-LOW-01", DATE_ADD(CURDATE(), INTERVAL 1 YEAR), "active")',
    [org1Id, lowProd.insertId],
  );
  // Inventory is only 5 units (below reorder_level of 100)
  await pool.query(
    'INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?, 5, "available")',
    [org1Id, branch1Id, wh1Id, location1Id, lowProd.insertId, lowBatch.insertId, unitId],
  );

  // Scan alerts endpoint
  const scanRes1 = await agentUserA.post('/api/v1/notifications/scan-alerts').send({
    organizationId: org1Id,
  });
  assert.equal(scanRes1.status, 200);
  assert.ok(scanRes1.body.data.lowStockAlerts >= 1);

  // Verify User A (has inventory.view) received low stock alert
  const notifList = await agentUserA.get('/api/v1/notifications?type=stock_low');
  assert.equal(notifList.status, 200);
  assert.ok(notifList.body.data.items.some((n) => n.resource_id === lowProd.insertId));

  // Second scan call should not create duplicates due to date-based dedup
  const countBefore = (await agentUserA.get('/api/v1/notifications?type=stock_low')).body.data.total;
  await agentUserA.post('/api/v1/notifications/scan-alerts').send({ organizationId: org1Id });
  const countAfter = (await agentUserA.get('/api/v1/notifications?type=stock_low')).body.data.total;
  assert.equal(countBefore, countAfter, 'Second scan on same day must not create duplicate alerts');
});

after(async () => {
  if (closePool) await closePool();
});
