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

  // Ensure all standard roles exist and assign SYSTEM_ADMINISTRATOR to dev user
  await ensureStandardRoles(pool);

  const [adminRole] = await pool.query("SELECT id FROM roles WHERE code = 'SYSTEM_ADMINISTRATOR' LIMIT 1");
  const adminRoleId = adminRole[0].id;

  await pool.query(
    'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
    [userId, adminRoleId],
  );
  console.log('[seed] ensured SYSTEM_ADMINISTRATOR role for the development user');
}

export async function ensureStandardRoles(pool) {
  const roles = [
    { id: 1, name: 'System Administrator', code: 'SYSTEM_ADMINISTRATOR', desc: 'Full administrative access to system governance features' },
    { name: 'Branch Manager', code: 'BRANCH_MANAGER', desc: 'Supervise branch operations, approvals, and performance dashboards' },
    { name: 'Pharmacist', code: 'PHARMACIST', desc: 'Clinical governance, prescription validation, and dispensing verification' },
    { name: 'Pharmacy Technician', code: 'PHARMACY_TECHNICIAN', desc: 'Prepare dispensing, allocate stock, and register patients under supervision' },
    { name: 'Sales / Cashier', code: 'CASHIER', desc: 'Process POS sales, standard discounts, payment collections, and receipts' },
    { name: 'Warehouse / Storekeeper', code: 'STOREKEEPER', desc: 'Physical inventory, receiving, stock counts, transfers, and quarantine handling' },
    { name: 'Procurement Officer', code: 'PROCUREMENT_OFFICER', desc: 'Supplier management, purchase order drafting, and replenishment tracking' },
    { name: 'Finance User', code: 'FINANCE_USER', desc: 'Payments, accounts receivable, refunds, and financial reporting' },
    { name: 'Management / Reporting User', code: 'MANAGEMENT_REPORTING', desc: 'Operational monitoring, executive dashboards, and authorized report export' },
  ];

  for (const r of roles) {
    if (r.id === 1) {
      await pool.query(
        "INSERT INTO roles (id, name, code, description, status) VALUES (1, ?, ?, ?, 'active') ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'",
        [r.name, r.code, r.desc]
      );
      await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions');
    } else {
      await pool.query(
        "INSERT INTO roles (name, code, description, status) VALUES (?, ?, ?, 'active') ON DUPLICATE KEY UPDATE status = 'active'",
        [r.name, r.code, r.desc]
      );
    }
  }

  const rolePermMap = {
    BRANCH_MANAGER: [
      'report.dashboard.view', 'report.sales.view', 'report.inventory.view', 'report.financial.view',
      'report.procurement.view', 'report.dispensing.view', 'report.expiry_quarantine.view',
      'data.export.view', 'data.export.execute',
      'sale.view', 'customer_return.view', 'customer_return.inspect', 'customer_return.approve',
      'inventory.view', 'stock_movement.view', 'batch.view', 'stock_transfer.view', 'stock_transfer.approve', 'stock_transfer.reject',
      'stock_count.view', 'stock_count.approve', 'stock_count.reject',
      'expiry.view', 'quarantine.view', 'recall.view',
      'purchase_order.view', 'purchase_order.approve', 'goods_receipt.view',
      'approval.view', 'approval.create', 'approval.cancel', 'approval.discount', 'approval.credit',
      'approval.inventory', 'approval.procurement', 'approval.quarantine', 'approval.policy.view', 'approval.execute',
      'search.view', 'audit.view', 'audit.export', 'notification.view',
      'organization.view', 'branch.view', 'warehouse.view', 'storage_location.view', 'user.view'
    ],
    PHARMACIST: [
      'patient.view', 'patient.create', 'patient.update',
      'prescriber.view',
      'prescription.view', 'prescription.create', 'prescription.update', 'prescription.validate', 'prescription.cancel',
      'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate', 'dispensing.verify', 'dispensing.reject', 'dispensing.cancel',
      'product.view', 'inventory.view', 'batch.view', 'expiry.view', 'quarantine.view', 'recall.view',
      'search.view', 'notification.view'
    ],
    PHARMACY_TECHNICIAN: [
      'patient.view', 'patient.create',
      'prescriber.view',
      'prescription.view',
      'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate',
      'product.view', 'inventory.view', 'batch.view', 'expiry.view',
      'search.view', 'notification.view'
    ],
    CASHIER: [
      'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete', 'sale.cancel',
      'payment.view', 'payment.create',
      'customer.view', 'customer.create',
      'product.view', 'search.view', 'notification.view',
      'customer_return.view', 'customer_return.create'
    ],
    STOREKEEPER: [
      'inventory.view', 'inventory.create', 'inventory.update', 'stock_movement.view',
      'batch.view', 'batch.create', 'batch.update', 'storage_location.view',
      'goods_receipt.view', 'goods_receipt.create', 'goods_receipt.update', 'goods_receipt.complete', 'goods_receipt.cancel',
      'stock_transfer.view', 'stock_transfer.create', 'stock_transfer.dispatch', 'stock_transfer.receive',
      'stock_count.view', 'stock_count.create', 'stock_count.record', 'stock_count.submit',
      'quarantine.view', 'quarantine.create', 'recall.view', 'expiry.view',
      'product.view', 'search.view', 'notification.view'
    ],
    PROCUREMENT_OFFICER: [
      'supplier.view', 'supplier.create', 'supplier.update',
      'purchase_order.view', 'purchase_order.create', 'purchase_order.update', 'purchase_order.submit', 'purchase_order.cancel',
      'goods_receipt.view',
      'supplier_return.view', 'supplier_return.create', 'supplier_return.cancel',
      'product.view', 'search.view', 'notification.view'
    ],
    FINANCE_USER: [
      'payment.view', 'payment.create', 'payment.verify', 'payment.cancel', 'payment.refund',
      'receivable.view', 'receivable.manage', 'credit_sale.authorize',
      'report.financial.view', 'report.sales.view',
      'data.export.view', 'data.export.execute',
      'customer.view', 'supplier.view',
      'search.view', 'notification.view'
    ],
    MANAGEMENT_REPORTING: [
      'report.dashboard.view', 'report.sales.view', 'report.inventory.view', 'report.financial.view',
      'report.procurement.view', 'report.dispensing.view', 'report.expiry_quarantine.view',
      'data.export.view', 'data.export.execute',
      'search.view', 'notification.view'
    ],
  };

  for (const [code, perms] of Object.entries(rolePermMap)) {
    const [r] = await pool.query('SELECT id FROM roles WHERE code = ? LIMIT 1', [code]);
    if (r.length > 0) {
      const roleId = r[0].id;
      for (const p of perms) {
        await pool.query(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code = ?',
          [roleId, p]
        );
      }
    }
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
