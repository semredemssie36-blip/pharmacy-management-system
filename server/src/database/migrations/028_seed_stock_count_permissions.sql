-- Task 16 — Stock Count & Stock Adjustment Permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(147, 'stock_count.view',             'inventory', 'stock_count', 'view',             'View stock count sessions, count sheets, and variances'),
(148, 'stock_count.create',           'inventory', 'stock_count', 'create',           'Create stock count sessions and define counting scope'),
(149, 'stock_count.record',           'inventory', 'stock_count', 'record',           'Record and revise physical stock count quantities on count sheets'),
(150, 'stock_count.submit',           'inventory', 'stock_count', 'submit',           'Submit stock count sessions for review and variance investigation'),
(151, 'stock_count.approve',          'inventory', 'stock_count', 'approve',          'Approve stock count variances and authorized adjustments'),
(152, 'stock_count.reject',           'inventory', 'stock_count', 'reject',           'Reject stock count sessions or request mandatory recount'),
(153, 'stock_count.apply_adjustment', 'inventory', 'stock_count', 'apply_adjustment', 'Apply approved stock variances to system inventory ledger'),
(154, 'stock_count.cancel',           'inventory', 'stock_count', 'cancel',           'Cancel stock count sessions prior to adjustment application');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 147 AND 154;
