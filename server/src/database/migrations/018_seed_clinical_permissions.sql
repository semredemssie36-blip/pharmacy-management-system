-- Task 11 — Clinical permissions for Patients, Prescribers, Prescriptions.

INSERT INTO permissions (id, code, module, resource, action, description) VALUES
(99,  'patient.view',           'clinical', 'patient',      'view',       'View patient records and history'),
(100, 'patient.create',         'clinical', 'patient',      'create',     'Register new patient records'),
(101, 'patient.update',         'clinical', 'patient',      'update',     'Update patient records'),
(102, 'patient.deactivate',     'clinical', 'patient',      'deactivate', 'Deactivate patient records'),
(103, 'prescriber.view',        'clinical', 'prescriber',   'view',       'View doctor/prescriber records'),
(104, 'prescriber.create',      'clinical', 'prescriber',   'create',     'Register new doctor/prescriber records'),
(105, 'prescriber.update',      'clinical', 'prescriber',   'update',     'Update doctor/prescriber records'),
(106, 'prescriber.deactivate',  'clinical', 'prescriber',   'deactivate', 'Deactivate doctor/prescriber records'),
(107, 'prescription.view',      'clinical', 'prescription', 'view',       'View prescriptions and lines'),
(108, 'prescription.create',    'clinical', 'prescription', 'create',     'Create draft prescriptions'),
(109, 'prescription.update',    'clinical', 'prescription', 'update',     'Edit draft prescriptions'),
(110, 'prescription.validate',  'clinical', 'prescription', 'validate',   'Clinically validate prescriptions'),
(111, 'prescription.cancel',    'clinical', 'prescription', 'cancel',     'Cancel prescriptions');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE id BETWEEN 99 AND 111;
