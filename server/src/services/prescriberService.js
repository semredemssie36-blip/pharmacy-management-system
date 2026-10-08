import prescriberRepository from '../repositories/prescriberRepository.js';
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

async function generatePrescriberNumber(organizationId) {
  const pool = getPool();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const candidate = `DOC-${organizationId}-${rand}`;
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await pool.query(
      'SELECT id FROM prescribers WHERE organization_id = ? AND prescriber_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  throw new AppError('Failed to generate unique prescriber number, please retry', {
    statusCode: 500,
    code: 'PRESCRIBER_NUMBER_GENERATION_FAILED',
  });
}

function validatePrescriberInput(input) {
  const errors = [];
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    errors.push({ field: 'name', message: 'Doctor/prescriber name is required' });
  }
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}

async function listPrescribers(userId, filters) {
  const sets = await getScopeSets(userId);
  return prescriberRepository.list({
    ...filters,
    accessibleOrgIds: sets.orgIds,
  });
}

async function getPrescriberById(id, userId) {
  const prescriber = await prescriberRepository.findById(id);
  if (!prescriber) throw new AppError('Prescriber not found', { statusCode: 404, code: 'PRESCRIBER_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, prescriber.organization_id)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  return prescriber;
}

async function createPrescriber(input, userId) {
  const organizationId = Number(input.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Valid organizationId is required' }]);
  }

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, organizationId)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  validatePrescriberInput(input);

  // Check unique license number within organization if provided
  if (input.licenseNumber && input.licenseNumber.trim()) {
    const existing = await prescriberRepository.findByLicenseNumber(organizationId, input.licenseNumber.trim());
    if (existing) {
      throw new AppError('Prescriber with this license number already exists in this organization', {
        statusCode: 409,
        code: 'DUPLICATE_LICENSE_NUMBER',
      });
    }
  }

  const prescriberNumber = await generatePrescriberNumber(organizationId);

  return prescriberRepository.create({
    organizationId,
    prescriberNumber,
    name: input.name.trim(),
    licenseNumber: input.licenseNumber ? input.licenseNumber.trim() : null,
    specialty: input.specialty ? input.specialty.trim() : null,
    workplace: input.workplace ? input.workplace.trim() : null,
    phone: input.phone ? input.phone.trim() : null,
    email: input.email ? input.email.trim() : null,
    address: input.address ? input.address.trim() : null,
    status: input.status === 'inactive' ? 'inactive' : 'active',
    notes: input.notes ? input.notes.trim() : null,
    createdBy: userId,
  });
}

async function updatePrescriber(id, input, userId) {
  const existing = await prescriberRepository.findById(id);
  if (!existing) throw new AppError('Prescriber not found', { statusCode: 404, code: 'PRESCRIBER_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing.organization_id)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  validatePrescriberInput(input);

  if (input.licenseNumber && input.licenseNumber.trim() && input.licenseNumber.trim() !== existing.license_number) {
    const dup = await prescriberRepository.findByLicenseNumber(existing.organization_id, input.licenseNumber.trim());
    if (dup && dup.id !== existing.id) {
      throw new AppError('Prescriber with this license number already exists in this organization', {
        statusCode: 409,
        code: 'DUPLICATE_LICENSE_NUMBER',
      });
    }
  }

  return prescriberRepository.update(id, {
    name: input.name.trim(),
    licenseNumber: input.licenseNumber ? input.licenseNumber.trim() : null,
    specialty: input.specialty ? input.specialty.trim() : null,
    workplace: input.workplace ? input.workplace.trim() : null,
    phone: input.phone ? input.phone.trim() : null,
    email: input.email ? input.email.trim() : null,
    address: input.address ? input.address.trim() : null,
    notes: input.notes ? input.notes.trim() : null,
  });
}

async function updatePrescriberStatus(id, status, userId) {
  if (!['active', 'inactive'].includes(status)) {
    throw new ValidationError('Validation failed', [{ field: 'status', message: 'Status must be active or inactive' }]);
  }

  const existing = await prescriberRepository.findById(id);
  if (!existing) throw new AppError('Prescriber not found', { statusCode: 404, code: 'PRESCRIBER_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing.organization_id)) {
    throw new AppError('You do not have access to this organization.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  return prescriberRepository.updateStatus(id, status);
}

async function getPrescriberPrescriptions(id, userId) {
  const prescriber = await getPrescriberById(id, userId);
  const prescriptions = await prescriberRepository.getPrescriptions(id);
  return { prescriber, prescriptions };
}

export default {
  listPrescribers,
  getPrescriberById,
  createPrescriber,
  updatePrescriber,
  updatePrescriberStatus,
  getPrescriberPrescriptions,
};
