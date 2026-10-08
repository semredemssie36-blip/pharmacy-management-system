-- Task 06 — Inventory foundation permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(66, 'inventory.view',   'inventory', 'inventory',      'view',   'View inventory'),
(67, 'inventory.create', 'inventory', 'inventory',      'create', 'Create inventory (e.g. opening balance)'),
(68, 'inventory.update', 'inventory', 'inventory',      'update', 'Update inventory metadata when allowed'),
(69, 'stock_movement.view', 'inventory', 'stock_movement', 'view', 'View stock movements'),
(70, 'batch.view',       'inventory', 'batch',          'view',   'View batches'),
(71, 'batch.create',     'inventory', 'batch',          'create', 'Create batches'),
(72, 'batch.update',     'inventory', 'batch',          'update', 'Update batches');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE id BETWEEN 66 AND 72;
