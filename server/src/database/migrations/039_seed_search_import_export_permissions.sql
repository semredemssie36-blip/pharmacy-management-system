-- Task 22 — Global Search, Data Import and Export Permissions

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(188, 'search.view',          'system',          'global_search', 'view',    'Use global search across authorized modules'),
(189, 'data.import.view',     'data_management', 'data_import',   'view',    'View data import templates, previews, and job history'),
(190, 'data.import.execute',  'data_management', 'data_import',   'execute', 'Execute data imports for authorized master data'),
(191, 'data.export.view',     'data_management', 'data_export',   'view',    'View exportable datasets and options'),
(192, 'data.export.execute',  'data_management', 'data_export',   'execute', 'Export data to CSV format for authorized resources');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SYSTEM_ADMINISTRATOR' AND p.id BETWEEN 188 AND 192;
