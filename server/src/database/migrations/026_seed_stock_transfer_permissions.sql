-- Task 15 — Stock Transfer Permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(138, 'stock_transfer.view',               'inventory', 'stock_transfer', 'view',               'View stock transfers and batch allocations'),
(139, 'stock_transfer.create',             'inventory', 'stock_transfer', 'create',             'Create stock transfer requests'),
(140, 'stock_transfer.submit',             'inventory', 'stock_transfer', 'submit',             'Submit stock transfer requests for approval'),
(141, 'stock_transfer.approve',            'inventory', 'stock_transfer', 'approve',            'Approve stock transfer requests'),
(142, 'stock_transfer.reject',             'inventory', 'stock_transfer', 'reject',             'Reject stock transfer requests'),
(143, 'stock_transfer.dispatch',           'inventory', 'stock_transfer', 'dispatch',           'Dispatch stock transfers from source warehouse'),
(144, 'stock_transfer.receive',            'inventory', 'stock_transfer', 'receive',            'Receive stock transfers at destination warehouse'),
(145, 'stock_transfer.cancel',             'inventory', 'stock_transfer', 'cancel',             'Cancel stock transfer requests'),
(146, 'stock_transfer.resolve_discrepancy', 'inventory', 'stock_transfer', 'resolve_discrepancy', 'Resolve stock transfer receiving discrepancies');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 138 AND 146;
