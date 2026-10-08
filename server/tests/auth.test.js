/**
 * Auth API tests run against a dedicated test database
 * (pharmacy_erp_test) so the dev database is never touched.
 * NODE_ENV and DATABASE_NAME are set before any app module is imported
 * (dynamic import in before()).
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

const ACTIVE_EMAIL = 'active-test@pharmacy.local';
const ACTIVE_PASSWORD = 'Sup3rSecret!';
const INACTIVE_EMAIL = 'inactive-test@pharmacy.local';
const INACTIVE_PASSWORD = 'Sup3rSecret!';

let app;
let pool;
let closePool;

before(async () => {
  const migrate = await import('../src/database/migrate.js');
  await migrate.runMigrations();

  pool = (await import('../src/database/pool.js')).getPool();
  closePool = (await import('../src/database/pool.js')).closePool;
  app = (await import('../src/app.js')).default;

  await pool.query('DELETE FROM users WHERE email IN (?, ?)', [ACTIVE_EMAIL, INACTIVE_EMAIL]);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    [
      'Active Test User',
      ACTIVE_EMAIL,
      await bcrypt.hash(ACTIVE_PASSWORD, 10),
      'active',
      'Inactive Test User',
      INACTIVE_EMAIL,
      await bcrypt.hash(INACTIVE_PASSWORD, 10),
      'inactive',
    ],
  );
});

after(async () => {
  try {
    if (pool) {
      await pool.query('DELETE FROM users WHERE email IN (?, ?)', [ACTIVE_EMAIL, INACTIVE_EMAIL]);
    }
  } finally {
    if (closePool) await closePool();
  }
});

function extractAuthCookie(res) {
  const cookies = res.headers['set-cookie'] || [];
  const found = cookies.find((c) => c.startsWith('pharmacy_erp_auth='));
  return found ? found.split(';')[0] : null;
}

test('health endpoint still works', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'ok');
});

test('login succeeds with valid credentials and sets httpOnly cookie', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.user.email, ACTIVE_EMAIL);
  assert.equal(res.body.data.user.status, 'active');

  // 8. Login response must never leak secrets
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes('password'));
  assert.ok(!raw.includes(ACTIVE_PASSWORD));

  const setCookieRaw = (res.headers['set-cookie'] || []).join(';');
  assert.match(setCookieRaw, /HttpOnly/i);
});

test('login fails with wrong password (generic message)', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ACTIVE_EMAIL, password: 'wrong-password' });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('login fails with unknown email using the same generic message', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nobody@pharmacy.local', password: 'whatever123' });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal(res.body.error.message, 'Invalid email or password');
});

test('inactive users cannot authenticate', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: INACTIVE_EMAIL, password: INACTIVE_PASSWORD });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE');
});

test('login validates the request body', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.body.error.details));
});

test('unauthenticated access to /api/v1/auth/me fails', async () => {
  const res = await request(app).get('/api/v1/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTHENTICATION_REQUIRED');
});

test('authenticated access to /api/v1/auth/me succeeds and returns safe user only', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD });
  const cookie = extractAuthCookie(loginRes);
  assert.ok(cookie);

  const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.email, ACTIVE_EMAIL);
  assert.ok(!JSON.stringify(res.body).includes('password_hash'));
});

test('logout invalidates authentication', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD });
  const cookie = extractAuthCookie(loginRes);

  const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
  assert.equal(logoutRes.status, 200);

  const cleared = (logoutRes.headers['set-cookie'] || []).join(';');
  assert.match(cleared, /pharmacy_erp_auth=;/);
});

test('malformed auth cookie is rejected', async () => {
  const res = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', 'pharmacy_erp_auth=not-a-real-token');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTHENTICATION_INVALID');
});
