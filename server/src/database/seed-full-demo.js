/**
 * Comprehensive Enterprise Demo Data Seeder
 * Populates real organizational structure, 9 canonical actors, realistic medicine master data,
 * inventory batches (in-stock, near-expiry, low-stock), suppliers, customers, and sales transactions.
 */
import bcrypt from 'bcryptjs';
import { getPool, closePool } from './pool.js';
import { ensureStandardRoles } from './seed.js';

const DEMO_PASSWORD = 'Passw0rd!123';

export async function seedFullDemo() {
  const pool = getPool();
  console.log('[seed-demo] Starting comprehensive demo data seed...');

  // 1. Ensure Standard Roles exist
  await ensureStandardRoles(pool);

  // 2. Organization: EthioCodes Central Pharmacy
  let [orgs] = await pool.query("SELECT id FROM organizations WHERE code = 'ECPHARMA' LIMIT 1");
  let orgId;
  if (orgs.length > 0) {
    orgId = orgs[0].id;
  } else {
    const [res] = await pool.query(
      "INSERT INTO organizations (name, code, status) VALUES ('EthioCodes Central Pharmacy', 'ECPHARMA', 'active')"
    );
    orgId = res.insertId;
  }

  // 3. Branches
  async function getOrCreateBranch(name, code) {
    const [rows] = await pool.query('SELECT id FROM branches WHERE organization_id = ? AND code = ? LIMIT 1', [orgId, code]);
    if (rows.length > 0) return rows[0].id;
    const [res] = await pool.query(
      'INSERT INTO branches (organization_id, name, code, status) VALUES (?, ?, ?, "active")',
      [orgId, name, code]
    );
    return res.insertId;
  }

  const branchPiassaId = await getOrCreateBranch('Piassa Main Branch', 'PIASSA');
  const branchMegenagnaId = await getOrCreateBranch('Megenagna Retail Branch', 'MEGEN');
  const branchBoleId = await getOrCreateBranch('Bole Diagnostic Branch', 'BOLE');

  // 4. Warehouses
  async function getOrCreateWarehouse(branchId, name, code) {
    const [rows] = await pool.query('SELECT id FROM warehouses WHERE branch_id = ? AND code = ? LIMIT 1', [branchId, code]);
    if (rows.length > 0) return rows[0].id;
    const [res] = await pool.query(
      'INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, ?, ?, "active")',
      [branchId, name, code]
    );
    return res.insertId;
  }

  const whPiassaId = await getOrCreateWarehouse(branchPiassaId, 'Piassa Central Warehouse', 'WH-PIASSA');
  const whMegenagnaId = await getOrCreateWarehouse(branchMegenagnaId, 'Megenagna Store', 'WH-MEGEN');

  // 5. Storage Locations
  async function getOrCreateLocation(warehouseId, name, code) {
    const [rows] = await pool.query('SELECT id FROM storage_locations WHERE warehouse_id = ? AND code = ? LIMIT 1', [warehouseId, code]);
    if (rows.length > 0) return rows[0].id;
    const [res] = await pool.query(
      'INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, ?, ?, "active")',
      [warehouseId, name, code]
    );
    return res.insertId;
  }

  const locAmbientId = await getOrCreateLocation(whPiassaId, 'Aisle 1 - Ambient Shelves', 'LOC-AMB');
  const locFastMoverId = await getOrCreateLocation(whPiassaId, 'Aisle 2 - Fast Moving OTC', 'LOC-FAST');
  const locColdId = await getOrCreateLocation(whPiassaId, 'Cold Room 2-8°C - Biologicals', 'LOC-COLD');

  // 6. Users: The 9 Canonical Actors
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const actors = [
    {
      name: 'Dr. Dawit Haile',
      email: 'admin@pharmacy.local',
      roleCode: 'SYSTEM_ADMINISTRATOR',
      scopeType: 'organization',
      scopeId: orgId,
    },
    {
      name: 'Selamawit Tadesse',
      email: 'manager@pharmacy.local',
      roleCode: 'BRANCH_MANAGER',
      scopeType: 'branch',
      scopeId: branchPiassaId,
    },
    {
      name: 'Henok Girma (RPh)',
      email: 'pharmacist@pharmacy.local',
      roleCode: 'PHARMACIST',
      scopeType: 'branch',
      scopeId: branchPiassaId,
    },
    {
      name: 'Blen Alemu',
      email: 'technician@pharmacy.local',
      roleCode: 'PHARMACY_TECHNICIAN',
      scopeType: 'branch',
      scopeId: branchPiassaId,
    },
    {
      name: 'Yared Bekele',
      email: 'cashier@pharmacy.local',
      roleCode: 'CASHIER',
      scopeType: 'branch',
      scopeId: branchPiassaId,
    },
    {
      name: 'Tewodros Kassahun',
      email: 'storekeeper@pharmacy.local',
      roleCode: 'STOREKEEPER',
      scopeType: 'warehouse',
      scopeId: whPiassaId,
    },
    {
      name: 'Marta Desta',
      email: 'procurement@pharmacy.local',
      roleCode: 'PROCUREMENT_OFFICER',
      scopeType: 'organization',
      scopeId: orgId,
    },
    {
      name: 'Kalkidan Tesfaye',
      email: 'finance@pharmacy.local',
      roleCode: 'FINANCE_USER',
      scopeType: 'organization',
      scopeId: orgId,
    },
    {
      name: 'Ermias Worku',
      email: 'reporting@pharmacy.local',
      roleCode: 'MANAGEMENT_REPORTING',
      scopeType: 'organization',
      scopeId: orgId,
    },
  ];

  for (const actor of actors) {
    let [uRows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [actor.email]);
    let userId;
    if (uRows.length > 0) {
      userId = uRows[0].id;
      await pool.query('UPDATE users SET name = ?, password_hash = ?, status = "active" WHERE id = ?', [
        actor.name,
        passwordHash,
        userId,
      ]);
    } else {
      const [uRes] = await pool.query(
        'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, "active")',
        [actor.name, actor.email, passwordHash]
      );
      userId = uRes.insertId;
    }

    // Assign Role
    const [rRows] = await pool.query('SELECT id FROM roles WHERE code = ? LIMIT 1', [actor.roleCode]);
    if (rRows.length > 0) {
      const roleId = rRows[0].id;
      await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    }

    // Assign Scope
    await pool.query('DELETE FROM user_scopes WHERE user_id = ?', [userId]);
    if (actor.scopeType === 'organization') {
      await pool.query(
        'INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, "organization", ?)',
        [userId, orgId]
      );
    } else if (actor.scopeType === 'branch') {
      await pool.query(
        'INSERT INTO user_scopes (user_id, scope_type, organization_id, branch_id) VALUES (?, "branch", ?, ?)',
        [userId, orgId, actor.scopeId]
      );
    } else if (actor.scopeType === 'warehouse') {
      await pool.query(
        'INSERT INTO user_scopes (user_id, scope_type, organization_id, branch_id, warehouse_id) VALUES (?, "warehouse", ?, ?, ?)',
        [userId, orgId, branchPiassaId, actor.scopeId]
      );
    }
  }

  // 7. Units of Measure
  async function getOrCreateUnit(name, code) {
    const [rows] = await pool.query('SELECT id FROM units WHERE organization_id = ? AND code = ? LIMIT 1', [orgId, code]);
    if (rows.length > 0) return rows[0].id;
    const [res] = await pool.query('INSERT INTO units (organization_id, name, code, status) VALUES (?, ?, ?, "active")', [
      orgId,
      name,
      code,
    ]);
    return res.insertId;
  }

  const uTab = await getOrCreateUnit('Tablet', 'TAB');
  const uCap = await getOrCreateUnit('Capsule', 'CAP');
  const uBtl = await getOrCreateUnit('Bottle', 'BTL');

  // 8. Products
  const productsData = [
    { code: 'PARACET-500', name: 'Paracetamol 500mg', barcode: '8901112223331', classification: 'otc', price: 20.0, unitId: uTab },
    { code: 'AMOX-250', name: 'Amoxicillin 250mg', barcode: '8901112223332', classification: 'prescription', price: 45.0, unitId: uCap },
    { code: 'CETIR-10', name: 'Cetirizine 10mg', barcode: '8901112223333', classification: 'otc', price: 15.0, unitId: uTab },
    { code: 'OMEP-20', name: 'Omeprazole 20mg', barcode: '8901112223334', classification: 'prescription', price: 60.0, unitId: uCap },
    { code: 'AZITH-500', name: 'Azithromycin 500mg', barcode: '8901112223335', classification: 'prescription', price: 120.0, unitId: uTab },
    { code: 'INS-GLAR', name: 'Insulin Glargine 100IU', barcode: '8901112223336', classification: 'prescription', price: 850.0, unitId: uBtl },
  ];

  const productMap = {};
  for (const p of productsData) {
    let [pRows] = await pool.query('SELECT id FROM products WHERE organization_id = ? AND code = ? LIMIT 1', [orgId, p.code]);
    let prodId;
    if (pRows.length > 0) {
      prodId = pRows[0].id;
    } else {
      const [res] = await pool.query(
        'INSERT INTO products (organization_id, code, barcode, name, prescription_classification, selling_price, status) VALUES (?, ?, ?, ?, ?, ?, "active")',
        [orgId, p.code, p.barcode, p.name, p.classification, p.price]
      );
      prodId = res.insertId;
      await pool.query(
        'INSERT IGNORE INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)',
        [prodId, p.unitId]
      );
    }
    productMap[p.code] = { id: prodId, unitId: p.unitId, price: p.price };
  }

  // 9. Batches & Inventory (Matching the Mockup Expiry & Top Sellers)
  const now = new Date();
  const plusDays = (d) => {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    return date.toISOString().slice(0, 10);
  };

  const batchesData = [
    // Healthy future stock
    { prodCode: 'PARACET-500', batchNum: 'AMX123', expiry: plusDays(10), qty: 150, status: 'available', locId: locFastMoverId }, // 10 days left (matches mockup alert!)
    { prodCode: 'AMOX-250', batchNum: 'CET456', expiry: plusDays(35), qty: 85, status: 'available', locId: locAmbientId }, // 35 days left (matches mockup alert!)
    { prodCode: 'OMEP-20', batchNum: 'OME789', expiry: plusDays(61), qty: 120, status: 'available', locId: locAmbientId }, // 61 days left (matches mockup alert!)
    { prodCode: 'AZITH-500', batchNum: 'AZI321', expiry: plusDays(76), qty: 95, status: 'available', locId: locAmbientId }, // 76 days left (matches mockup alert!)
    { prodCode: 'CETIR-10', batchNum: 'BATCH-CET-OK', expiry: plusDays(450), qty: 400, status: 'available', locId: locFastMoverId },
    { prodCode: 'PARACET-500', batchNum: 'BATCH-PAR-BULK', expiry: plusDays(500), qty: 500, status: 'available', locId: locFastMoverId },
    { prodCode: 'INS-GLAR', batchNum: 'BATCH-INS-COLD', expiry: plusDays(300), qty: 45, status: 'available', locId: locColdId },
    // Quarantined hold
    { prodCode: 'AMOX-250', batchNum: 'BATCH-AMOX-HOLD', expiry: plusDays(200), qty: 25, status: 'quarantined', locId: locAmbientId },
  ];

  for (const b of batchesData) {
    const prod = productMap[b.prodCode];
    if (!prod) continue;

    let [bRows] = await pool.query(
      'SELECT id FROM batches WHERE organization_id = ? AND product_id = ? AND batch_number = ? LIMIT 1',
      [orgId, prod.id, b.batchNum]
    );
    let batchId;
    if (bRows.length > 0) {
      batchId = bRows[0].id;
    } else {
      const [res] = await pool.query(
        'INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, ?, ?, "active")',
        [orgId, prod.id, b.batchNum, b.expiry]
      );
      batchId = res.insertId;
    }

    const [invRows] = await pool.query(
      'SELECT id FROM inventory WHERE organization_id = ? AND branch_id = ? AND product_id = ? AND batch_id = ? LIMIT 1',
      [orgId, branchPiassaId, prod.id, batchId]
    );
    if (invRows.length === 0) {
      await pool.query(
        'INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [orgId, branchPiassaId, whPiassaId, b.locId, prod.id, batchId, prod.unitId, b.status, b.qty]
      );
    }
  }

  // 10. Customers & Suppliers
  let [custs] = await pool.query('SELECT id FROM customers WHERE organization_id = ? LIMIT 1', [orgId]);
  let custId;
  if (custs.length > 0) {
    custId = custs[0].id;
  } else {
    const [cRes] = await pool.query(
      'INSERT INTO customers (organization_id, name, telephone, status, credit_limit) VALUES (?, "Walk-in Retail Customer", "0911000000", "active", 5000)',
      [orgId]
    );
    custId = cRes.insertId;
  }

  console.log('[seed-demo] Demo data seeded successfully with 9 canonical actors, products, batches, and inventory!');
}

if (process.argv[1] && process.argv[1].endsWith('seed-full-demo.js')) {
  seedFullDemo()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[seed-demo] Error:', err);
      await closePool();
      process.exit(1);
    });
}
