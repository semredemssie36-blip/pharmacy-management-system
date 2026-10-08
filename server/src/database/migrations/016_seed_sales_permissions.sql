-- Task 10 — Sales / POS permissions granted to the bootstrap admin role.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(92, 'sale.view',     'sales', 'sale', 'view',     'View sales and receipts'),
(93, 'sale.create',   'sales', 'sale', 'create',   'Create draft sales'),
(94, 'sale.update',   'sales', 'sale', 'update',   'Edit draft sales'),
(95, 'sale.confirm',  'sales', 'sale', 'confirm',  'Confirm draft sales / move to payment pending'),
(96, 'sale.complete', 'sales', 'sale', 'complete', 'Complete sales (consumes inventory)'),
(97, 'sale.cancel',   'sales', 'sale', 'cancel',   'Cancel uncompleted sales'),
(98, 'sale.void',     'sales', 'sale', 'void',     'Void completed sales (reverses inventory)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE id BETWEEN 92 AND 98;
