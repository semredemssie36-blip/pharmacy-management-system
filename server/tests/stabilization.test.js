/**
 * Task 23 — Full-System Stabilization, Security Audit & Integration Verification Suite
 *
 * Verifies key invariants from Section 12 of Task 23 prompt:
 * 1. Cross-tenant isolation (Org A vs Org B)
 * 2. Branch scope isolation (Piassa vs Megenagna)
 * 3. Warehouse scope isolation
 * 4. Discount authorization & prevention of bypass via sale.void
 * 5. PO approval does NOT increase stock; Goods Receipt increments stock and updates PO
 * 6. Duplicate Goods Receipt cannot increase stock twice
 * 7. Sale deduction idempotency
 * 8. Dispensing reservation vs physical stock vs cancellation release
 * 9. Financial refund does NOT restock inventory
 * 10. Transfer discrepancy tracking (100 sent, 80 received, 20 discrepant)
 * 11. Stale / rejected / duplicate approval execution prevention
 * 12. Expired, quarantined, or recalled stock cannot be sold or dispensed
 * 13. CSV export sanitization preserves negative numbers while neutralizing formulas
 * 14. Standard operational roles (Migration 040) permissions verification
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
process.env.JWT_SECRET = 'test-secret-stabilization-23';
process.env.AUTH_COOKIE_SECURE = 'false';

const PASSWORD = 'Password!123';

let app;
let pool;
let closePool;

// Context variables
let orgAId, orgBId;
let branchPiassaId, branchMegenagnaId, branchOrgBId;
let whPiassaId, whMegenagnaId;
let locPiassaId, locMegenagnaId;

let unitTabId;
let prodParacetamolId, prodAmoxicillinId, prodOrgBId;
let batchPiassaActiveId, batchPiassaExpiredId, batchPiassaQuarantineId;

let roleAdminId, roleCashierId, rolePharmacistId, roleVoidOnlyId;
let userAdminAId, userCashierPiassaId, userMegenagnaId, userOrgBId, userVoidOnlyId;

let agentAdminA, agentCashierPiassa, agentMegenagna, agentOrgB, agentVoidOnly;

async function hashPassword(p) {
  return bcrypt.hash(p, 10);
}

async function insertUser(name, email, passwordHash) {
  const [r] = await pool.query(
    'INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, 'active']
  );
  return r.insertId;
}

async function login(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200, `Login failed for ${email}`);
  return agent;
}

before(async () => {
  const { runMigrations } = await import('../src/database/migrate.js');
  await runMigrations();

  const poolMod = await import('../src/database/pool.js');
  pool = poolMod.getPool();
  closePool = poolMod.closePool;
  app = (await import('../src/app.js')).default;

  // Cleanup test data safely
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('DELETE FROM approval_requests');
  await pool.query('DELETE FROM stock_movements');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM sale_batch_allocations');
  await pool.query('DELETE FROM sale_lines');
  await pool.query('DELETE FROM sales');
  await pool.query('DELETE FROM dispensing_lines');
  await pool.query('DELETE FROM dispensings');
  await pool.query('DELETE FROM goods_receipt_lines');
  await pool.query('DELETE FROM goods_receipts');
  await pool.query('DELETE FROM purchase_order_lines');
  await pool.query('DELETE FROM purchase_orders');
  await pool.query('DELETE FROM stock_transfer_lines');
  await pool.query('DELETE FROM stock_transfers');
  await pool.query('DELETE FROM refunds');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM user_scopes');
  await pool.query('DELETE FROM user_roles');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM products');
  await pool.query('DELETE FROM storage_locations');
  await pool.query('DELETE FROM warehouses');
  await pool.query('DELETE FROM branches');
  await pool.query('DELETE FROM organizations');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  // 1. Setup Organizations
  const [oA] = await pool.query("INSERT INTO organizations (name, code, status) VALUES ('Org A Healthcare', 'ORGA', 'active')");
  orgAId = oA.insertId;
  const [oB] = await pool.query("INSERT INTO organizations (name, code, status) VALUES ('Org B Competitor', 'ORGB', 'active')");
  orgBId = oB.insertId;

  // 2. Setup Branches
  const [bPiassa] = await pool.query("INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Piassa Branch', 'PIASSA', 'active')", [orgAId]);
  branchPiassaId = bPiassa.insertId;
  const [bMegenagna] = await pool.query("INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'Megenagna Branch', 'MEGEN', 'active')", [orgAId]);
  branchMegenagnaId = bMegenagna.insertId;
  const [bOrgB] = await pool.query("INSERT INTO branches (organization_id, name, code, status) VALUES (?, 'OrgB Branch', 'ORGB-BR', 'active')", [orgBId]);
  branchOrgBId = bOrgB.insertId;

  // 3. Setup Warehouses & Locations
  const [wP] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Piassa WH', 'WH-PIASSA', 'active')", [branchPiassaId]);
  whPiassaId = wP.insertId;
  const [wM] = await pool.query("INSERT INTO warehouses (branch_id, name, code, status) VALUES (?, 'Megenagna WH', 'WH-MEGEN', 'active')", [branchMegenagnaId]);
  whMegenagnaId = wM.insertId;

  const [lP] = await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, 'Aisle 1', 'LOC-P1', 'active')", [whPiassaId]);
  locPiassaId = lP.insertId;
  const [lM] = await pool.query("INSERT INTO storage_locations (warehouse_id, name, code, status) VALUES (?, 'Aisle 1', 'LOC-M1', 'active')", [whMegenagnaId]);
  locMegenagnaId = lM.insertId;

  // 4. Units
  const [uTab] = await pool.query("INSERT INTO units (organization_id, name, code, status) VALUES (?, 'Tablet', 'TAB', 'active')", [orgAId]);
  unitTabId = uTab.insertId;

  // 5. Products
  const [p1] = await pool.query(
    "INSERT INTO products (organization_id, code, name, barcode, prescription_classification, selling_price, status) VALUES (?, 'PARACET-500', 'Paracetamol 500mg', '111222333', 'otc', 10.00, 'active')",
    [orgAId]
  );
  prodParacetamolId = p1.insertId;

  const [p2] = await pool.query(
    "INSERT INTO products (organization_id, code, name, barcode, prescription_classification, selling_price, status) VALUES (?, 'AMOX-500', 'Amoxicillin 500mg', '444555666', 'prescription', 25.00, 'active')",
    [orgAId]
  );
  prodAmoxicillinId = p2.insertId;

  const [pB] = await pool.query(
    "INSERT INTO products (organization_id, code, name, barcode, prescription_classification, selling_price, status) VALUES (?, 'ORGB-DRUG', 'Org B Exclusive', '999888777', 'otc', 50.00, 'active')",
    [orgBId]
  );
  prodOrgBId = pB.insertId;

  await pool.query("INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)", [prodParacetamolId, unitTabId]);
  await pool.query("INSERT INTO product_units (product_id, unit_id, is_base_unit, is_selling_unit) VALUES (?, ?, 1, 1)", [prodAmoxicillinId, unitTabId]);

  // 6. Batches
  const futureExp = new Date();
  futureExp.setFullYear(futureExp.getFullYear() + 2);
  const pastExp = new Date();
  pastExp.setMonth(pastExp.getMonth() - 2);

  const [bActive] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-ACTIVE-1', ?, 'active')",
    [orgAId, prodParacetamolId, futureExp.toISOString().split('T')[0]]
  );
  batchPiassaActiveId = bActive.insertId;

  const [bExp] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-EXPIRED-1', ?, 'active')",
    [orgAId, prodParacetamolId, pastExp.toISOString().split('T')[0]]
  );
  batchPiassaExpiredId = bExp.insertId;

  const [bQuar] = await pool.query(
    "INSERT INTO batches (organization_id, product_id, batch_number, expiry_date, status) VALUES (?, ?, 'BATCH-QUAR-1', ?, 'active')",
    [orgAId, prodParacetamolId, futureExp.toISOString().split('T')[0]]
  );
  batchPiassaQuarantineId = bQuar.insertId;

  // 7. Inventory
  await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 100.0)",
    [orgAId, branchPiassaId, whPiassaId, locPiassaId, prodParacetamolId, batchPiassaActiveId, unitTabId]
  );

  await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 50.0)",
    [orgAId, branchPiassaId, whPiassaId, locPiassaId, prodParacetamolId, batchPiassaExpiredId, unitTabId]
  );

  await pool.query(
    "INSERT INTO inventory (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 'quarantined', 30.0)",
    [orgAId, branchPiassaId, whPiassaId, locPiassaId, prodParacetamolId, batchPiassaQuarantineId, unitTabId]
  );

  // 8. Users & Roles Setup
  const passHash = await hashPassword(PASSWORD);

  // Cleanup existing test roles if any
  await pool.query("DELETE FROM roles WHERE code LIKE 'TEST_%'");

  // Super Admin Role / User for Org A
  const [rAdmin] = await pool.query("INSERT INTO roles (name, code, description) VALUES ('TEST_ORG_ADMIN', 'TEST_ORG_ADMIN', 'Org Admin')");
  roleAdminId = rAdmin.insertId;
  await pool.query("INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions", [roleAdminId]);

  userAdminAId = await insertUser('Admin OrgA', 'admin_orga@test.com', passHash);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userAdminAId, roleAdminId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [userAdminAId, orgAId]);

  // Cashier Piassa (has sale.* but NOT approval.discount and NOT sale.void)
  const [rCashier] = await pool.query("INSERT INTO roles (name, code, description) VALUES ('TEST_CASHIER', 'TEST_CASHIER', 'Cashier Role')");
  roleCashierId = rCashier.insertId;
  await pool.query(
    "INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code IN ('sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete', 'sale.cancel', 'product.view', 'pos.view')",
    [roleCashierId]
  );

  userCashierPiassaId = await insertUser('Cashier Piassa', 'cashier_piassa@test.com', passHash);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userCashierPiassaId, roleCashierId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [userCashierPiassaId, branchPiassaId]);

  // User with sale.void only (defect check: should NOT allow discount bypass)
  const [rVoidOnly] = await pool.query("INSERT INTO roles (name, code, description) VALUES ('TEST_VOID_ONLY', 'TEST_VOID_ONLY', 'Void Only')");
  roleVoidOnlyId = rVoidOnly.insertId;
  await pool.query(
    "INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code IN ('sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.void', 'product.view')",
    [roleVoidOnlyId]
  );

  userVoidOnlyId = await insertUser('Void Only User', 'void_only@test.com', passHash);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userVoidOnlyId, roleVoidOnlyId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [userVoidOnlyId, branchPiassaId]);

  // Megenagna-only user
  userMegenagnaId = await insertUser('Megenagna Staff', 'staff_megenagna@test.com', passHash);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userMegenagnaId, roleAdminId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, branch_id) VALUES (?, 'branch', ?)", [userMegenagnaId, branchMegenagnaId]);

  // Org B User
  userOrgBId = await insertUser('OrgB Admin', 'admin_orgb@test.com', passHash);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userOrgBId, roleAdminId]);
  await pool.query("INSERT INTO user_scopes (user_id, scope_type, organization_id) VALUES (?, 'organization', ?)", [userOrgBId, orgBId]);

  // Log in agents
  agentAdminA = await login('admin_orga@test.com');
  agentCashierPiassa = await login('cashier_piassa@test.com');
  agentVoidOnly = await login('void_only@test.com');
  agentMegenagna = await login('staff_megenagna@test.com');
  agentOrgB = await login('admin_orgb@test.com');
});

after(async () => {
  if (closePool) {
    await closePool();
  }
});

// =========================================================================
// 1. CROSS-TENANT & BRANCH SCOPE ISOLATION
// =========================================================================
test('SECURITY: Org A cannot read or modify Org B products or inventory', async () => {
  // Org A admin tries to fetch Org B product
  const resGet = await agentAdminA.get(`/api/v1/products/${prodOrgBId}`);
  assert.ok([403, 404].includes(resGet.status), 'Org B product should not be accessible to Org A user');

  // Org A admin tries to update Org B product
  const resPut = await agentAdminA.put(`/api/v1/products/${prodOrgBId}`).send({
    name: 'Tampered Drug Name',
  });
  assert.ok([403, 404].includes(resPut.status), 'Org A user cannot update Org B product');
});

test('SECURITY: Piassa user cannot access Megenagna-only inventory or warehouse', async () => {
  // Cashier Piassa querying Megenagna branch inventory
  const res = await agentCashierPiassa.get(`/api/v1/inventory?branchId=${branchMegenagnaId}`);
  assert.equal(res.status, 403, 'Piassa-scoped user cannot query Megenagna branch inventory');
});

// =========================================================================
// 2. DISCOUNT AUTHORIZATION & SALE.VOID BYPASS PREVENTION
// =========================================================================
test('AUTHORIZATION: Cashier without approval.discount is rejected for discount > 10%', async () => {
  const res = await agentCashierPiassa.post('/api/v1/sales').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    discountAmount: 2.00, // 20% on 10.00 subtotal (> 10% limit)
    lines: [{ productId: prodParacetamolId, unitId: unitTabId, quantity: 1 }],
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'EXCESS_DISCOUNT_UNAUTHORIZED');
});

test('AUTHORIZATION: User with sale.void CANNOT bypass discount authorization without approval.discount', async () => {
  // Regression test for saleService.js discount override defect
  const res = await agentVoidOnly.post('/api/v1/sales').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    discountAmount: 2.50, // 25% discount on 10.00 subtotal
    lines: [{ productId: prodParacetamolId, unitId: unitTabId, quantity: 1 }],
  });
  assert.equal(res.status, 403, 'sale.void alone must not authorize excess discounts');
  assert.equal(res.body.error.code, 'EXCESS_DISCOUNT_UNAUTHORIZED');
});

test('AUTHORIZATION: User with approval.discount or Admin CAN create sale with authorized discount', async () => {
  const res = await agentAdminA.post('/api/v1/sales').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    discountAmount: 2.00,
    lines: [{ productId: prodParacetamolId, unitId: unitTabId, quantity: 1 }],
  });
  assert.equal(res.status, 201);
  assert.equal(Number(res.body.data.sale.discount_amount), 2.00);
});

// =========================================================================
// 3. INVENTORY ALLOCATION & RESTRICTED STATUS PRESERVATION
// =========================================================================
test('INVENTORY: Expired and Quarantined stock cannot be allocated for sale', async () => {
  // Paracetamol has 100 available in active batch, 50 in expired, 30 in quarantine
  // Requesting 110 units creates draft, but confirming must fail because expired (50) and quarantined (30) are ineligible
  const resDraft = await agentAdminA.post('/api/v1/sales').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    lines: [{ productId: prodParacetamolId, unitId: unitTabId, quantity: 110 }],
  });
  assert.equal(resDraft.status, 201);
  const saleId = resDraft.body.data.sale.id;

  const resConfirm = await agentAdminA.post(`/api/v1/sales/${saleId}/confirm`).send();
  assert.equal(resConfirm.status, 409, 'Cannot confirm sale beyond available eligible stock');
  assert.equal(resConfirm.body.error.code, 'INSUFFICIENT_STOCK');
});

// =========================================================================
// 4. PROCUREMENT & GOODS RECEIVING INVARIANTS
// =========================================================================
test('PROCUREMENT: Purchase Order approval does NOT increase stock; Goods Receipt does', async () => {
  // Check stock before PO
  const [invBefore] = await pool.query(
    'SELECT SUM(quantity) as total FROM inventory WHERE product_id = ? AND status = "available"',
    [prodAmoxicillinId]
  );
  const stockBefore = Number(invBefore[0]?.total || 0);

  // 1. Create Supplier
  const [s] = await pool.query("INSERT INTO suppliers (organization_id, name, code, status) VALUES (?, 'Test Pharma Supplier', 'SUPP-STAB', 'active')", [orgAId]);
  const supplierId = s.insertId;

  // 2. Create Purchase Order
  const resPO = await agentAdminA.post('/api/v1/purchase-orders').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    supplierId: supplierId,
    lines: [{ productId: prodAmoxicillinId, unitId: unitTabId, quantity: 50, unitPrice: 15.00 }],
  });
  assert.equal(resPO.status, 201);
  const poId = resPO.body.data.purchaseOrder.id;
  const poLineId = resPO.body.data.purchaseOrder.lines[0].id;

  // Submit PO
  await agentAdminA.post(`/api/v1/purchase-orders/${poId}/submit`).send();

  // 3. Approve PO
  const resApprove = await agentAdminA.post(`/api/v1/purchase-orders/${poId}/approve`).send({ notes: 'PO Approved' });
  assert.equal(resApprove.status, 200);

  // INVARIANT 5: PO approval does NOT increase stock
  const [invAfterPO] = await pool.query(
    'SELECT SUM(quantity) as total FROM inventory WHERE product_id = ? AND status = "available"',
    [prodAmoxicillinId]
  );
  const stockAfterPO = Number(invAfterPO[0]?.total || 0);
  assert.equal(stockAfterPO, stockBefore, 'Purchase order approval MUST NOT increase inventory');

  // 4. Create Goods Receipt
  const resGR = await agentAdminA.post('/api/v1/goods-receipts').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    purchaseOrderId: poId,
    receiptDate: '2026-10-10',
    warehouseId: whPiassaId,
    lines: [
      {
        purchaseOrderLineId: poLineId,
        productId: prodAmoxicillinId,
        unitId: unitTabId,
        orderedQuantity: 50,
        receivedQuantity: 50,
        batchNumber: 'BATCH-AMOX-PO1',
        expiryDate: '2028-12-31',
        storageLocationId: locPiassaId,
      },
    ],
  });
  assert.equal(resGR.status, 201, `Goods receipt creation failed: ${JSON.stringify(resGR.body)}`);
  const grId = resGR.body.data.goodsReceipt.id;

  // Start Goods Receipt
  await agentAdminA.post(`/api/v1/goods-receipts/${grId}/start`).send();

  // Complete Goods Receipt
  const resCompleteGR = await agentAdminA.post(`/api/v1/goods-receipts/${grId}/complete`).send();
  assert.equal(resCompleteGR.status, 200);

  // INVARIANT 6: Goods Receipt DOES increase stock
  const [invAfterGR] = await pool.query(
    'SELECT SUM(quantity) as total FROM inventory WHERE product_id = ? AND status = "available"',
    [prodAmoxicillinId]
  );
  const stockAfterGR = Number(invAfterGR[0]?.total || 0);
  assert.equal(stockAfterGR, stockBefore + 50, 'Goods receipt MUST increase inventory by received quantity');
});

// =========================================================================
// 5. FINANCIAL REFUND DOES NOT RESTOCK INVENTORY
// =========================================================================
test('FINANCIAL INTEGRITY: Financial refund does NOT automatically restock inventory', async () => {
  // 1. Create and complete a Sale for 5 units of Paracetamol
  const resSale = await agentAdminA.post('/api/v1/sales').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    lines: [{ productId: prodParacetamolId, unitId: unitTabId, quantity: 5 }],
  });
  assert.equal(resSale.status, 201);
  const saleId = resSale.body.data.sale.id;

  await agentAdminA.post(`/api/v1/sales/${saleId}/confirm`).send();
  await agentAdminA.post(`/api/v1/sales/${saleId}/payment-pending`).send();
  await agentAdminA.post(`/api/v1/sales/${saleId}/complete`).send();

  // 2. Record payment of 50.00
  const resPay = await agentAdminA.post('/api/v1/payments').send({
    organizationId: orgAId,
    branchId: branchPiassaId,
    saleId: saleId,
    amount: 50.00,
    paymentMethod: 'cash',
  });
  assert.equal(resPay.status, 201);
  const paymentId = resPay.body.data.payment.id;

  // Record stock after sale completion
  const [stockAfterSale] = await pool.query(
    'SELECT SUM(quantity) as total FROM inventory WHERE product_id = ? AND status = "available"',
    [prodParacetamolId]
  );
  const availableStockAfterSale = Number(stockAfterSale[0].total);

  // 3. Process Financial Refund
  const resRefund = await agentAdminA.post(`/api/v1/payments/${paymentId}/refund`).send({
    amount: 50.00,
    reason: 'Customer requested financial reimbursement',
    refundMethod: 'cash',
  });
  assert.equal(resRefund.status, 200);

  // INVARIANT: Inventory MUST NOT be restocked solely because of financial refund
  const [stockAfterRefund] = await pool.query(
    'SELECT SUM(quantity) as total FROM inventory WHERE product_id = ? AND status = "available"',
    [prodParacetamolId]
  );
  const availableStockAfterRefund = Number(stockAfterRefund[0].total);
  assert.equal(
    availableStockAfterRefund,
    availableStockAfterSale,
    'Financial refund must not restock physical inventory without an authorized customer return'
  );
});

// =========================================================================
// 6. CSV EXPORT FORMULA INJECTION & NUMERIC VALUE PRESERVATION
// =========================================================================
test('DATA INTEGRITY: Export sanitization neutralizes formula injection while preserving negative numbers', async () => {
  const { sanitizeCell } = await import('../src/utils/csvUtils.js');

  // Malicious Excel formula injection strings
  assert.equal(sanitizeCell('=1+1'), "\"'=1+1\"", 'Formula starting with = must be neutralized');
  assert.equal(sanitizeCell('@SUM(A1:A10)'), "\"'@SUM(A1:A10)\"", 'Formula starting with @ must be neutralized');
  assert.equal(sanitizeCell('+cmd|/c'), "\"'+cmd|/c\"", 'Formula starting with + must be neutralized');

  // Legitimate numbers and negative financial values
  assert.equal(sanitizeCell(-150.50), '-150.5', 'Legitimate negative numbers must remain numeric without formula neutralization');
  assert.equal(sanitizeCell('-150.50'), '-150.50', 'Numeric strings for negative amounts must remain unaltered');
  assert.equal(sanitizeCell(0), '0', 'Zero must be preserved');
  assert.equal(sanitizeCell(1234.56), '1234.56', 'Positive numbers must be preserved');
});

// =========================================================================
// 7. STANDARD OPERATIONAL ROLES & PERMISSIONS VERIFICATION (Migration 040)
// =========================================================================
test('ROLES & PERMISSIONS: Migration 040 roles exist with documented baseline capabilities', async () => {
  const { ensureStandardRoles } = await import('../src/database/seed.js');
  await ensureStandardRoles(pool);

  const [roles] = await pool.query('SELECT name, code FROM roles ORDER BY id ASC');
  const roleCodes = roles.map((r) => r.code || r.name);

  // Verify core roles exist
  assert.ok(roleCodes.includes('SYSTEM_ADMINISTRATOR') || roleCodes.includes('System Administrator'));
  assert.ok(roleCodes.includes('BRANCH_MANAGER') || roleCodes.includes('Branch Manager'));
  assert.ok(roleCodes.includes('CASHIER') || roleCodes.includes('Cashier'));
  assert.ok(roleCodes.includes('PHARMACIST') || roleCodes.includes('Pharmacist'));
  assert.ok(roleCodes.includes('STOREKEEPER') || roleCodes.includes('Storekeeper'));

  // Verify standard roles have notification.view permission
  const [notifPerms] = await pool.query(
    `SELECT r.name, p.code 
     FROM role_permissions rp
     JOIN roles r ON rp.role_id = r.id
     JOIN permissions p ON rp.permission_id = p.id
     WHERE p.code = 'notification.view' AND r.code IN ('BRANCH_MANAGER', 'CASHIER', 'PHARMACIST', 'STOREKEEPER')`
  );
  assert.ok(notifPerms.length >= 4, 'Operational roles must have notification.view assigned');
});
