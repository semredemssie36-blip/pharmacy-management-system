import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import organizationRepository from '../repositories/organizationRepository.js';
import authorizationService from './authorizationService.js';

const notFound = () => new AppError('Organization not found', { statusCode: 404, code: 'ORGANIZATION_NOT_FOUND' });

function validateInput({ name, code }, { partial = false } = {}) {
  const details = [];
  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      details.push({ field: 'name', message: 'Name is required' });
    }
  }
  if (!partial || code !== undefined) {
    if (typeof code !== 'string' || code.trim() === '') {
      details.push({ field: 'code', message: 'Code is required' });
    }
  }
  if (details.length) throw new ValidationError('Validation failed', details);
}

function validateStatus(status) {
  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    throw new ValidationError('Validation failed', [{ field: 'status', message: "Status must be 'active' or 'inactive'" }]);
  }
}

async function list(userId) {
  const rows = await organizationRepository.findAll();
  if (!userId) return rows;
  const scope = await authorizationService.getUserScope(userId);
  return rows.filter((row) => authorizationService.canAccessOrganization(scope, row.id));
}

async function getById(id, userId) {
  const org = await organizationRepository.findById(id);
  if (!org) throw notFound();
  if (userId) await authorizationService.assertOrganizationAccess(userId, org.id);
  return org;
}

async function create(input) {
  validateInput(input);
  validateStatus(input.status);
  const existing = await organizationRepository.findByCode(input.code.trim());
  if (existing) {
    throw new AppError('Organization code already exists', { statusCode: 409, code: 'DUPLICATE_ORGANIZATION_CODE' });
  }
  return organizationRepository.create({
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    status: input.status || 'active',
  });
}

async function update(id, input, userId) {
  const org = await getById(id, userId);
  validateInput(input, { partial: true });
  validateStatus(input.status);

  if (input.code && input.code.trim().toUpperCase() !== org.code) {
    const existing = await organizationRepository.findByCode(input.code.trim().toUpperCase());
    if (existing && existing.id !== id) {
      throw new AppError('Organization code already exists', { statusCode: 409, code: 'DUPLICATE_ORGANIZATION_CODE' });
    }
  }

  return organizationRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

async function deactivate(id, userId) {
  await getById(id, userId);
  return organizationRepository.update(id, { status: 'inactive' });
}

export default { list, getById, create, update, deactivate };
