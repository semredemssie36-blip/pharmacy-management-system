import patientRepository from '../repositories/patientRepository.js';
import authorizationService from './authorizationService.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import { getPool } from '../database/pool.js';

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

function canAccess(scopeSets, organizationId) {
  return scopeSets.orgIds.includes(Number(organizationId));
}

async function generatePatientNumber(organizationId) {
  const pool = getPool();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const candidate = `PAT-${organizationId}-${rand}`;
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await pool.query(
      'SELECT id FROM patients WHERE organization_id = ? AND patient_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  throw new AppError('Failed to generate unique patient number, please retry', {
    statusCode: 500,
    code: 'PATIENT_NUMBER_GENERATION_FAILED',
  });
}

function validatePatientInput(input) {
  const errors = [];

  if (!input.firstName || typeof input.firstName !== 'string' || !input.firstName.trim()) {
    errors.push({ field: 'firstName', message: 'First name is required' });
  }
  if (!input.lastName || typeof input.lastName !== 'string' || !input.lastName.trim()) {
    errors.push({ field: 'lastName', message: 'Last name is required' });
  }
  if (!input.gender || !['male', 'female', 'other'].includes(input.gender.toLowerCase())) {
    errors.push({ field: 'gender', message: 'Valid gender (male, female, other) is required' });
  }

  if (!input.dateOfBirth) {
    errors.push({ field: 'dateOfBirth', message: 'Date of birth is required' });
  } else {
    const dob = new Date(input.dateOfBirth);
    const now = new Date();
    if (Number.isNaN(dob.getTime())) {
      errors.push({ field: 'dateOfBirth', message: 'Invalid date format for date of birth' });
    } else if (dob > now) {
      errors.push({ field: 'dateOfBirth', message: 'Date of birth cannot be in the future' });
    } else {
      const earliest = new Date();
      earliest.setFullYear(now.getFullYear() - 130);
      if (dob < earliest) {
        errors.push({ field: 'dateOfBirth', message: 'Date of birth is outside reasonable historical range' });
      }
    }
  }

  if (input.phone && typeof input.phone === 'string' && input.phone.trim().length > 50) {
    errors.push({ field: 'phone', message: 'Phone number cannot exceed 50 characters' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}

async function listPatients(userId, filters) {
  const sets = await getScopeSets(userId);
  return patientRepository.list({
    ...filters,
    accessibleOrgIds: sets.orgIds,
  });
}

async function getPatientById(id, userId) {
  const patient = await patientRepository.findById(id);
  if (!patient) throw new AppError('Patient not found', { statusCode: 404, code: 'PATIENT_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, patient.organization_id)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  return patient;
}

async function createPatient(input, userId) {
  const organizationId = Number(input.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Valid organizationId is required' }]);
  }

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, organizationId)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  validatePatientInput(input);

  const patientNumber = await generatePatientNumber(organizationId);

  // Check for duplicate signals
  const duplicateSignals = await patientRepository.findDuplicates({
    organizationId,
    phone: input.phone,
    identificationNumber: input.identificationNumber,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
  });

  const patient = await patientRepository.create({
    organizationId,
    patientNumber,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    gender: input.gender.toLowerCase(),
    dateOfBirth: input.dateOfBirth,
    phone: input.phone ? input.phone.trim() : null,
    email: input.email ? input.email.trim() : null,
    identificationType: input.identificationType ? input.identificationType.trim() : null,
    identificationNumber: input.identificationNumber ? input.identificationNumber.trim() : null,
    address: input.address ? input.address.trim() : null,
    emergencyContactName: input.emergencyContactName ? input.emergencyContactName.trim() : null,
    emergencyContactPhone: input.emergencyContactPhone ? input.emergencyContactPhone.trim() : null,
    emergencyContactRelationship: input.emergencyContactRelationship ? input.emergencyContactRelationship.trim() : null,
    bloodGroup: input.bloodGroup ? input.bloodGroup.trim() : null,
    allergies: input.allergies ? input.allergies.trim() : null,
    medicalHistory: input.medicalHistory ? input.medicalHistory.trim() : null,
    insuranceProvider: input.insuranceProvider ? input.insuranceProvider.trim() : null,
    insurancePolicyNumber: input.insurancePolicyNumber ? input.insurancePolicyNumber.trim() : null,
    status: input.status === 'inactive' ? 'inactive' : 'active',
    notes: input.notes ? input.notes.trim() : null,
    createdBy: userId,
  });

  return {
    ...patient,
    possibleDuplicates: duplicateSignals.map((d) => ({
      id: d.id,
      patientNumber: d.patient_number,
      fullName: d.full_name,
      dob: d.date_of_birth,
      reasons: d.duplicate_reasons,
    })),
  };
}

async function updatePatient(id, input, userId) {
  const existing = await patientRepository.findById(id);
  if (!existing) throw new AppError('Patient not found', { statusCode: 404, code: 'PATIENT_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing.organization_id)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  validatePatientInput(input);

  return patientRepository.update(id, {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    gender: input.gender.toLowerCase(),
    dateOfBirth: input.dateOfBirth,
    phone: input.phone ? input.phone.trim() : null,
    email: input.email ? input.email.trim() : null,
    identificationType: input.identificationType ? input.identificationType.trim() : null,
    identificationNumber: input.identificationNumber ? input.identificationNumber.trim() : null,
    address: input.address ? input.address.trim() : null,
    emergencyContactName: input.emergencyContactName ? input.emergencyContactName.trim() : null,
    emergencyContactPhone: input.emergencyContactPhone ? input.emergencyContactPhone.trim() : null,
    emergencyContactRelationship: input.emergencyContactRelationship ? input.emergencyContactRelationship.trim() : null,
    bloodGroup: input.bloodGroup ? input.bloodGroup.trim() : null,
    allergies: input.allergies ? input.allergies.trim() : null,
    medicalHistory: input.medicalHistory ? input.medicalHistory.trim() : null,
    insuranceProvider: input.insuranceProvider ? input.insuranceProvider.trim() : null,
    insurancePolicyNumber: input.insurancePolicyNumber ? input.insurancePolicyNumber.trim() : null,
    notes: input.notes ? input.notes.trim() : null,
  });
}

async function updatePatientStatus(id, status, userId) {
  if (!['active', 'inactive'].includes(status)) {
    throw new ValidationError('Validation failed', [{ field: 'status', message: 'Status must be active or inactive' }]);
  }

  const existing = await patientRepository.findById(id);
  if (!existing) throw new AppError('Patient not found', { statusCode: 404, code: 'PATIENT_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing.organization_id)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  return patientRepository.updateStatus(id, status);
}

async function findPossibleDuplicates(userId, { organizationId, phone, identificationNumber, firstName, lastName, dateOfBirth, excludeId }) {
  const orgId = Number(organizationId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Valid organizationId is required' }]);
  }

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, orgId)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  return patientRepository.findDuplicates({
    organizationId: orgId,
    phone,
    identificationNumber,
    firstName,
    lastName,
    dateOfBirth,
    excludeId: excludeId ? Number(excludeId) : null,
  });
}

async function getPatientHistory(id, userId) {
  const patient = await getPatientById(id, userId);
  const prescriptions = await patientRepository.getPrescriptions(id);

  return {
    patient,
    history: {
      prescriptions,
      dispensingHistory: [], // Populated by Task 12
      medicationHistory: [], // Populated by Task 12
      refillHistory: [], // Populated by Task 12
      returnedMedicines: [], // Populated by Returns module
      pharmacistNotes: [],
    },
  };
}

export default {
  listPatients,
  getPatientById,
  createPatient,
  updatePatient,
  updatePatientStatus,
  findPossibleDuplicates,
  getPatientHistory,
};
