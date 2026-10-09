-- Task 13 — Payment, Credit & Accounts Receivable permissions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(119, 'payment.view',          'payments',    'payment',     'view',      'View payments and receipts'),
(120, 'payment.create',        'payments',    'payment',     'create',    'Record customer payments against sales, dispensings, or accounts'),
(121, 'payment.verify',        'payments',    'payment',     'verify',    'Verify electronic/bank payments'),
(122, 'payment.cancel',        'payments',    'payment',     'cancel',    'Cancel uncompleted or pending payments'),
(123, 'payment.refund',        'payments',    'payment',     'refund',    'Process authorized customer refunds'),
(124, 'receivable.view',       'receivables', 'receivable',  'view',      'View accounts receivable and customer ledger balances'),
(125, 'receivable.manage',     'receivables', 'receivable',  'manage',    'Manage credit balances and allocate customer account payments'),
(126, 'credit_sale.authorize', 'sales',       'credit_sale', 'authorize', 'Authorize credit sales and credit limit overrides');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 119 AND 126;
