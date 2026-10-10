-- Task 23 — System-Wide Role Stabilization and Permission Assignments
-- Ensures all 9 canonical roles from Stage 02 are formally seeded,
-- restores the System Administrator role and grants all permissions,
-- and assigns least-privilege permissions to each operational business role.
-- Also aligns foreign key cascading on audit_logs, notifications, and approval_requests.

-- 1. Restore System Administrator (Role 1)
INSERT INTO roles (id, name, code, description, status) VALUES
(1, 'System Administrator', 'SYSTEM_ADMINISTRATOR', 'Full administrative access to system governance features', 'active')
ON DUPLICATE KEY UPDATE name = 'System Administrator', status = 'active';

-- Ensure System Administrator holds all permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- 2. Seed the 8 Operational Business Roles from Stage 02
INSERT INTO roles (name, code, description, status) VALUES
('Branch Manager', 'BRANCH_MANAGER', 'Supervise branch operations, approvals, and performance dashboards', 'active'),
('Pharmacist', 'PHARMACIST', 'Clinical governance, prescription validation, and dispensing verification', 'active'),
('Pharmacy Technician', 'PHARMACY_TECHNICIAN', 'Prepare dispensing, allocate stock, and register patients under supervision', 'active'),
('Sales / Cashier', 'CASHIER', 'Process POS sales, standard discounts, payment collections, and receipts', 'active'),
('Warehouse / Storekeeper', 'STOREKEEPER', 'Physical inventory, receiving, stock counts, transfers, and quarantine handling', 'active'),
('Procurement Officer', 'PROCUREMENT_OFFICER', 'Supplier management, purchase order drafting, and replenishment tracking', 'active'),
('Finance User', 'FINANCE_USER', 'Payments, accounts receivable, refunds, and financial reporting', 'active'),
('Management / Reporting User', 'MANAGEMENT_REPORTING', 'Operational monitoring, executive dashboards, and authorized report export', 'active')
ON DUPLICATE KEY UPDATE status = 'active';

-- 3. Assign Role Permissions based on the documented responsibility matrix

-- BRANCH_MANAGER
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'BRANCH_MANAGER' AND p.code IN (
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
);

-- PHARMACIST
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'PHARMACIST' AND p.code IN (
  'patient.view', 'patient.create', 'patient.update',
  'prescriber.view',
  'prescription.view', 'prescription.create', 'prescription.update', 'prescription.validate', 'prescription.cancel',
  'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate', 'dispensing.verify', 'dispensing.reject', 'dispensing.cancel',
  'product.view', 'inventory.view', 'batch.view', 'expiry.view', 'quarantine.view', 'recall.view',
  'search.view', 'notification.view'
);

-- PHARMACY_TECHNICIAN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'PHARMACY_TECHNICIAN' AND p.code IN (
  'patient.view', 'patient.create',
  'prescriber.view',
  'prescription.view',
  'dispensing.view', 'dispensing.create', 'dispensing.update', 'dispensing.allocate',
  'product.view', 'inventory.view', 'batch.view', 'expiry.view',
  'search.view', 'notification.view'
);

-- CASHIER
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'CASHIER' AND p.code IN (
  'sale.view', 'sale.create', 'sale.update', 'sale.confirm', 'sale.complete', 'sale.cancel',
  'payment.view', 'payment.create',
  'customer.view', 'customer.create',
  'product.view', 'search.view', 'notification.view',
  'customer_return.view', 'customer_return.create'
);

-- STOREKEEPER
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'STOREKEEPER' AND p.code IN (
  'inventory.view', 'inventory.create', 'inventory.update', 'stock_movement.view',
  'batch.view', 'batch.create', 'batch.update', 'storage_location.view',
  'goods_receipt.view', 'goods_receipt.create', 'goods_receipt.update', 'goods_receipt.complete', 'goods_receipt.cancel',
  'stock_transfer.view', 'stock_transfer.create', 'stock_transfer.dispatch', 'stock_transfer.receive',
  'stock_count.view', 'stock_count.create', 'stock_count.record', 'stock_count.submit',
  'quarantine.view', 'quarantine.create', 'recall.view', 'expiry.view',
  'product.view', 'search.view', 'notification.view'
);

-- PROCUREMENT_OFFICER
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'PROCUREMENT_OFFICER' AND p.code IN (
  'supplier.view', 'supplier.create', 'supplier.update',
  'purchase_order.view', 'purchase_order.create', 'purchase_order.update', 'purchase_order.submit', 'purchase_order.cancel',
  'goods_receipt.view',
  'supplier_return.view', 'supplier_return.create', 'supplier_return.cancel',
  'product.view', 'search.view', 'notification.view'
);

-- FINANCE_USER
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'FINANCE_USER' AND p.code IN (
  'payment.view', 'payment.create', 'payment.verify', 'payment.cancel', 'payment.refund',
  'receivable.view', 'receivable.manage', 'credit_sale.authorize',
  'report.financial.view', 'report.sales.view',
  'data.export.view', 'data.export.execute',
  'customer.view', 'supplier.view',
  'search.view', 'notification.view'
);

-- MANAGEMENT_REPORTING
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'MANAGEMENT_REPORTING' AND p.code IN (
  'report.dashboard.view', 'report.sales.view', 'report.inventory.view', 'report.financial.view',
  'report.procurement.view', 'report.dispensing.view', 'report.expiry_quarantine.view',
  'data.export.view', 'data.export.execute',
  'search.view', 'notification.view'
);

-- 4. Align foreign key cascade rules on audit_logs, notifications, and approval_requests
ALTER TABLE audit_logs DROP FOREIGN KEY fk_audit_org;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE notifications DROP FOREIGN KEY fk_notif_org;
ALTER TABLE notifications ADD CONSTRAINT fk_notif_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE approval_requests DROP FOREIGN KEY fk_approval_org;
ALTER TABLE approval_requests ADD CONSTRAINT fk_approval_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE;
