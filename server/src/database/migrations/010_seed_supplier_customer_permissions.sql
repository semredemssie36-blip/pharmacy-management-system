-- Task 07 — Supplier/Customer permissions, granted to the bootstrap admin role.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(73, 'supplier.view',       'partners', 'supplier', 'view',       'View suppliers'),
(74, 'supplier.create',     'partners', 'supplier', 'create',     'Create suppliers'),
(75, 'supplier.update',     'partners', 'supplier', 'update',     'Update suppliers'),
(76, 'supplier.deactivate', 'partners', 'supplier', 'deactivate', 'Deactivate suppliers'),
(77, 'customer.view',       'partners', 'customer', 'view',       'View customers'),
(78, 'customer.create',     'partners', 'customer', 'create',     'Create customers'),
(79, 'customer.update',     'partners', 'customer', 'update',     'Update customers'),
(80, 'customer.deactivate', 'partners', 'customer', 'deactivate', 'Deactivate customers');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE id BETWEEN 73 AND 80;
