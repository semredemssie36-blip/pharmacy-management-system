-- Task 17 — Quarantine, Expiry, and Product Recall Permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(155, 'expiry.view',          'inventory', 'expiry',     'view',     'View near-expiry and expired batches and reports'),
(156, 'quarantine.view',      'inventory', 'quarantine', 'view',     'View quarantine cases, hold status, and history'),
(157, 'quarantine.create',    'inventory', 'quarantine', 'create',   'Place inventory on quarantine hold'),
(158, 'quarantine.review',    'inventory', 'quarantine', 'review',   'Review quarantine cases and recorded findings'),
(159, 'quarantine.release',   'inventory', 'quarantine', 'release',  'Release quarantined inventory back to available stock'),
(160, 'quarantine.dispose',   'inventory', 'quarantine', 'dispose',  'Authorize and post stock disposal or write-off'),
(161, 'recall.view',          'inventory', 'recall',     'view',     'View product recall cases, affected stock, and action log'),
(162, 'recall.create',        'inventory', 'recall',     'create',   'Initiate a product recall case'),
(163, 'recall.approve',       'inventory', 'recall',     'approve',  'Approve recall cases for activation'),
(164, 'recall.activate',      'inventory', 'recall',     'activate', 'Activate recall and trigger batch containment across warehouses'),
(165, 'recall.action',        'inventory', 'recall',     'action',   'Record recall disposition and containment actions'),
(166, 'recall.close',         'inventory', 'recall',     'close',    'Close or reconcile completed product recall cases');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 155 AND 166;
