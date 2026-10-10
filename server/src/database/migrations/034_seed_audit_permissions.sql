-- Task 19 — Centralized Audit Trail Permissions

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(178, 'audit.view',   'administration', 'audit', 'view',   'View audit trail logs and activity history'),
(179, 'audit.export', 'administration', 'audit', 'export', 'Export filtered audit logs and activity history');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 178 AND 179;
