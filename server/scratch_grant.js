import { getPool } from './src/database/pool.js';

async function updateFinance() {
  const pool = getPool();
  await pool.query(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id) 
    SELECT r.id, p.id FROM roles r, permissions p 
    WHERE r.code = 'FINANCE_USER' AND p.code IN ('customer_return.view', 'customer_return.complete')
  `);
  await pool.query(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id) 
    SELECT r.id, p.id FROM roles r, permissions p 
    WHERE r.code = 'MANAGEMENT_REPORTING' AND p.code IN ('customer.view', 'customer_return.view', 'supplier.view')
  `);
  console.log('Permissions updated successfully.');
  process.exit(0);
}

updateFinance().catch((err) => {
  console.error(err);
  process.exit(1);
});
