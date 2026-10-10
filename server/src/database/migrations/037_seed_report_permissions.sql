-- Task 21 — Reports and Dashboards Permissions

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(181, 'report.dashboard.view', 'reporting', 'dashboard', 'view', 'View operational dashboards and summary KPIs'),
(182, 'report.sales.view', 'reporting', 'sales_report', 'view', 'View sales performance and revenue reports'),
(183, 'report.inventory.view', 'reporting', 'inventory_report', 'view', 'View inventory balances, stock positions, and movement reports'),
(184, 'report.financial.view', 'reporting', 'financial_report', 'view', 'View collections, receivables, and financial summary reports'),
(185, 'report.procurement.view', 'reporting', 'procurement_report', 'view', 'View purchase order fulfillment and supplier receiving reports'),
(186, 'report.dispensing.view', 'reporting', 'dispensing_report', 'view', 'View prescription and dispensing operational reports'),
(187, 'report.expiry_quarantine.view', 'reporting', 'expiry_report', 'view', 'View expiry alerts, quarantine holds, and recall reports');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 181 AND 187;
