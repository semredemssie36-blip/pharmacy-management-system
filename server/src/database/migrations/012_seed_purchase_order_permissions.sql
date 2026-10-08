-- Task 08 — Purchase Order permissions granted to the bootstrap admin role.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(81, 'purchase_order.view',   'procurement', 'purchase_order', 'view',   'View purchase orders'),
(82, 'purchase_order.create', 'procurement', 'purchase_order', 'create', 'Create purchase orders'),
(83, 'purchase_order.update', 'procurement', 'purchase_order', 'update', 'Update draft purchase orders'),
(84, 'purchase_order.submit', 'procurement', 'purchase_order', 'submit', 'Submit purchase orders for approval'),
(85, 'purchase_order.cancel', 'procurement', 'purchase_order', 'cancel', 'Cancel purchase orders'),
(86, 'purchase_order.approve','procurement', 'purchase_order', 'approve','Approve/reject pending purchase orders');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE id BETWEEN 81 AND 86;
