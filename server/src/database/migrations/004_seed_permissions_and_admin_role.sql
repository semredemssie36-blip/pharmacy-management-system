-- Task 04 — Seed controlled system permissions and the bootstrap
-- "System Administrator" role. New users get NO roles unless assigned.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(1,  'organization.view',       'organization',     'organization',     'view',       'View organizations'),
(2,  'organization.create',     'organization',     'organization',     'create',     'Create organizations'),
(3,  'organization.update',     'organization',     'organization',     'update',     'Update organizations'),
(4,  'organization.deactivate', 'organization',     'organization',     'deactivate', 'Deactivate organizations'),
(5,  'branch.view',             'organization',     'branch',           'view',       'View branches'),
(6,  'branch.create',           'organization',     'branch',           'create',     'Create branches'),
(7,  'branch.update',           'organization',     'branch',           'update',     'Update branches'),
(8,  'branch.deactivate',       'organization',     'branch',           'deactivate', 'Deactivate branches'),
(9,  'warehouse.view',          'organization',     'warehouse',        'view',       'View warehouses'),
(10, 'warehouse.create',        'organization',     'warehouse',        'create',     'Create warehouses'),
(11, 'warehouse.update',        'organization',     'warehouse',        'update',     'Update warehouses'),
(12, 'warehouse.deactivate',    'organization',     'warehouse',        'deactivate', 'Deactivate warehouses'),
(13, 'storage_location.view',        'organization', 'storage_location', 'view',       'View storage locations'),
(14, 'storage_location.create',      'organization', 'storage_location', 'create',     'Create storage locations'),
(15, 'storage_location.update',      'organization', 'storage_location', 'update',     'Update storage locations'),
(16, 'storage_location.deactivate',  'organization', 'storage_location', 'deactivate', 'Deactivate storage locations'),
(17, 'user.view',               'administration',   'user',             'view',       'View users'),
(18, 'user.create',             'administration',   'user',             'create',     'Create users'),
(19, 'user.update',             'administration',   'user',             'update',     'Update users'),
(20, 'user.deactivate',         'administration',   'user',             'deactivate', 'Deactivate users'),
(21, 'role.view',               'administration',   'role',             'view',       'View roles'),
(22, 'role.create',             'administration',   'role',             'create',     'Create roles'),
(23, 'role.update',             'administration',   'role',             'update',     'Update roles'),
(24, 'role.deactivate',         'administration',   'role',             'deactivate', 'Deactivate roles'),
(25, 'permission.view',         'administration',   'permission',       'view',       'View permissions');

INSERT INTO roles (id, name, code, description, status) VALUES
(1, 'System Administrator', 'SYSTEM_ADMINISTRATOR', 'Full administrative access to system governance features', 'active');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;
