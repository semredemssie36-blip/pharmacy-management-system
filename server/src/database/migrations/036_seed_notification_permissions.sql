-- Task 20 — Notifications and User Alerts Permissions

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(180, 'notification.view', 'administration', 'notification', 'view', 'View notifications, alerts, and system announcements');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id = 180;
