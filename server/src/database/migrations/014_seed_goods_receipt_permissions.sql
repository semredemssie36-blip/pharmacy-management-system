-- Task 09 — Goods Receipt permissions granted to the bootstrap admin role.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(87, 'goods_receipt.view',   'procurement', 'goods_receipt', 'view',   'View goods receipts'),
(88, 'goods_receipt.create', 'procurement', 'goods_receipt', 'create', 'Create goods receipts'),
(89, 'goods_receipt.update', 'procurement', 'goods_receipt', 'update', 'Edit draft goods receipts'),
(90, 'goods_receipt.complete','procurement','goods_receipt', 'complete','Complete goods receipts (posts stock)'),
(91, 'goods_receipt.cancel', 'procurement', 'goods_receipt', 'cancel', 'Cancel goods receipts');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE id BETWEEN 87 AND 91;
