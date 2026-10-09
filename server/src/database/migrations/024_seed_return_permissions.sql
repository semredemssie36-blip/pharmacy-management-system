-- Task 14 — Customer Returns, Supplier Returns & Returned-Stock Disposition Permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(127, 'customer_return.view',     'returns', 'customer_return', 'view',     'View customer return requests and history'),
(128, 'customer_return.create',   'returns', 'customer_return', 'create',   'Create customer return requests against sales'),
(129, 'customer_return.inspect',  'returns', 'customer_return', 'inspect',  'Inspect returned medicines and determine disposition'),
(130, 'customer_return.approve',  'returns', 'customer_return', 'approve',  'Approve or reject customer return requests'),
(131, 'customer_return.complete', 'returns', 'customer_return', 'complete', 'Complete customer returns, apply stock disposition and refund'),
(132, 'customer_return.cancel',   'returns', 'customer_return', 'cancel',   'Cancel customer return requests'),
(133, 'supplier_return.view',     'returns', 'supplier_return', 'view',     'View supplier return orders and history'),
(134, 'supplier_return.create',   'returns', 'supplier_return', 'create',   'Create supplier return orders against goods receipts'),
(135, 'supplier_return.approve',  'returns', 'supplier_return', 'approve',  'Approve supplier return orders'),
(136, 'supplier_return.complete', 'returns', 'supplier_return', 'complete', 'Dispatch/complete supplier returns and deduct inventory'),
(137, 'supplier_return.cancel',   'returns', 'supplier_return', 'cancel',   'Cancel supplier return orders');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 127 AND 137;
