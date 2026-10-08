-- Task 12 — Dispensing permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(112, 'dispensing.view',      'dispensing', 'dispensing', 'view',     'View dispensing transactions and allocations'),
(113, 'dispensing.create',    'dispensing', 'dispensing', 'create',   'Create dispensing transactions'),
(114, 'dispensing.update',    'dispensing', 'dispensing', 'update',   'Edit draft dispensing transactions'),
(115, 'dispensing.allocate',  'dispensing', 'dispensing', 'allocate', 'Allocate FEFO stock for dispensing'),
(116, 'dispensing.verify',    'dispensing', 'dispensing', 'verify',   'Perform pharmacist clinical verification'),
(117, 'dispensing.reject',    'dispensing', 'dispensing', 'reject',   'Reject dispensing transaction with reason'),
(118, 'dispensing.cancel',    'dispensing', 'dispensing', 'cancel',   'Cancel dispensing and release stock reservations');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 112 AND 118;
