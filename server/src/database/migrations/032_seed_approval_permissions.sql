-- Task 18 — Centralized Approvals and Authorized Overrides Permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(167, 'approval.view',           'administration', 'approval', 'view',           'View approval requests and inbox'),
(168, 'approval.create',         'administration', 'approval', 'create',         'Submit approval and override requests'),
(169, 'approval.cancel',         'administration', 'approval', 'cancel',         'Cancel pending approval request'),
(170, 'approval.discount',       'finance',        'approval', 'discount',       'Approve or reject sales discount overrides'),
(171, 'approval.credit',         'finance',        'approval', 'credit',         'Approve or reject customer credit limit overrides'),
(172, 'approval.inventory',      'inventory',      'approval', 'inventory',      'Approve or reject stock count and adjustment overrides'),
(173, 'approval.quarantine',     'inventory',      'approval', 'quarantine',     'Approve or reject quarantine release and disposal overrides'),
(174, 'approval.procurement',    'procurement',    'approval', 'procurement',    'Approve or reject purchase order overrides'),
(175, 'approval.policy.view',    'administration', 'approval', 'policy_view',    'View approval policies and threshold rules'),
(176, 'approval.policy.manage',  'administration', 'approval', 'policy_manage',  'Create and configure approval policies and thresholds'),
(177, 'approval.execute',        'administration', 'approval', 'execute',        'Execute approved business actions and overrides');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 167 AND 177;
