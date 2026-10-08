import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

import { getPool, closePool } from './pool.js';

/**
 * Controlled development seed.
 *
 * Creates ONE local development login account (assigned the bootstrap
 * System Administrator role). This is a LOCAL TESTING account only —
 * it is not a production credential. Users created later get no roles
 * until one is explicitly assigned.
 *
 * Override via environment:
 *   SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
export async function seedDevelopmentUser() {
  const name = process.env.SEED_ADMIN_NAME || 'Development Admin';
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@pharmacy.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

  const pool = getPool();
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

  let userId;
  if (existing.length > 0) {
    console.log(`[seed] user ${email} already exists`);
    userId = existing[0].id;
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, 'active'],
    );
    userId = result.insertId;
    console.log(`[seed] created development user ${email} (password from SEED_ADMIN_PASSWORD or documented local default)`);
  }

  // Assign the bootstrap System Administrator role to the dev user.
  // New users created later get NO roles until explicitly assigned.
  const [roleRows] = await pool.query("SELECT id FROM roles WHERE code = 'SYSTEM_ADMINISTRATOR' LIMIT 1");
  if (roleRows.length > 0) {
    await pool.query(
      'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleRows[0].id],
    );
    console.log('[seed] ensured SYSTEM_ADMINISTRATOR role for the development user');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seedDevelopmentUser()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(`[seed] failed: ${err.message}`);
      await closePool();
      process.exit(1);
    });
}
