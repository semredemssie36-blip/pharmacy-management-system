import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool, closePool } from './pool.js';

/**
 * OPTIONAL development-only seed for the organizational structure.
 * Creates a demo organization with one branch, one warehouse, and
 * sample storage locations. This is NOT production data.
 */
async function ensureDevAdminScope(pool, organizationId) {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@pharmacy.local').toLowerCase();
  const [admins] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [adminEmail]);
  if (admins.length === 0) return;

  const [scopeExists] = await pool.query(
    "SELECT id FROM user_scopes WHERE user_id = ? AND scope_type = 'organization' AND organization_id = ? LIMIT 1",
    [admins[0].id, organizationId],
  );
  if (scopeExists.length === 0) {
    await pool.query(
      "INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)",
      [admins[0].id, organizationId],
    );
    console.log('[seed:organization] granted organization scope on DEMO to the development admin');
  }
}

export async function seedOrganizationDemo() {
  const pool = getPool();

  const [existing] = await pool.query("SELECT id FROM organizations WHERE code = 'DEMO' LIMIT 1");
  if (existing.length > 0) {
    console.log('[seed:organization] demo organization already exists');
    await ensureDevAdminScope(pool, existing[0].id);
    return;
  }

  const [org] = await pool.query(
    "INSERT INTO organizations (name, code, status) VALUES ('Example Pharmacy (Development)', 'DEMO', 'active')",
  );
  const orgId = org.insertId;

  const [branch] = await pool.query(
    'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, ?)',
    [orgId, 'Main Branch (Development)', 'MAIN', 'active'],
  );

  const [warehouse] = await pool.query(
    'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, ?)',
    [branch.insertId, 'Main Warehouse (Development)', 'MAINWH', 'active'],
  );

  const locations = [
    ['Shelf A (Development)', 'SHELF-A', 'normal'],
    ['Shelf B (Development)', 'SHELF-B', 'normal'],
    ['Cold Storage (Development)', 'COLD', 'refrigerated'],
  ];
  for (const [name, code, condition] of locations) {
    await pool.query(
      'INSERT INTO storage_locations (warehouse_id, name, code, storage_condition, status) VALUES (?, ?, ?, ?, ?)',
      [warehouse.insertId, name, code, condition, 'active'],
    );
  }

  console.log('[seed:organization] created demo organization structure (development only)');
  await ensureDevAdminScope(pool, orgId);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seedOrganizationDemo()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(`[seed:organization] failed: ${err.message}`);
      await closePool();
      process.exit(1);
    });
}
