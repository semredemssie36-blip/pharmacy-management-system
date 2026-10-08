import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import branchRepository from '../repositories/branchRepository.js';
import organizationRepository from '../repositories/organizationRepository.js';
import authorizationService from './authorizationService.js';

const notFound = () => new AppError('Branch not found', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });

function validateInput({ name, code, organizationId }, { partial = false } = {}) {
  const details = [];
  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') details.push({ field: 'name', message: 'Name is required' });
  }
  if (!partial || code !== undefined) {
    if (typeof code !== 'string' || code.trim() === '') details.push({ field: 'code', message: 'Code is required' });
  }
  if (!partial || organizationId !== undefined) {
    if (!Number.isInteger(Number(organizationId)) || Number(organizationId) <= 0) {
      details.push({ field: 'organizationId', message: 'A valid organizationId is required' });
    }
  }
  if (details.length) throw new ValidationError('Validation failed', details);
}

function validateStatus(status) {
  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    throw new ValidationError('Validation failed', [{ field: 'status', message: "Status must be 'active' or 'inactive'" }]);
  }
}

async function list(filters, userId) {
  const normalized = {};
  if (filters?.organizationId !== undefined) {
    const id = Number(filters.organizationId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Must be a positive integer' }]);
    }
    normalized.organizationId = id;
  }
  const rows = await branchRepository.findAll(normalized);
  if (!userId) return rows;
  const scope = await authorizationService.getUserScope(userId);
  return rows.filter((row) => authorizationService.canAccessBranch(scope, row));
}

async function getById(id, userId) {
  const branch = await branchRepository.findById(id);
  if (!branch) throw notFound();
  if (userId) await authorizationService.assertBranchAccess(userId, branch);
  return branch;
}

async function create(input, userId) {
  validateInput(input);
  validateStatus(input.status);

  const organization = await organizationRepository.findById(Number(input.organizationId));
  if (!organization) {
    throw new AppError('Organization does not exist', { statusCode: 404, code: 'ORGANIZATION_NOT_FOUND' });
  }
  if (organization.status !== 'active') {
    throw new AppError('Cannot create a branch under an inactive organization', { statusCode: 409, code: 'INACTIVE_PARENT' });
  }

  if (userId) {
    // Creating a branch requires scope on its parent organization.
    const scope = await authorizationService.getUserScope(userId);
    if (!authorizationService.canAccessOrganization(scope, organization.id)) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  const code = input.code.trim().toUpperCase();
  const existing = await branchRepository.findByCode(organization.id, code);
  if (existing) {
    throw new AppError('Branch code already exists in this organization', { statusCode: 409, code: 'DUPLICATE_BRANCH_CODE' });
  }

  return branchRepository.create({
    organizationId: organization.id,
    name: input.name.trim(),
    code,
    status: input.status || 'active',
  });
}

async function update(id, input, userId) {
  const branch = await getById(id, userId);
  validateInput(input, { partial: true });
  validateStatus(input.status);

  if (input.code && input.code.trim().toUpperCase() !== branch.code) {
    const existing = await branchRepository.findByCode(branch.organization_id, input.code.trim().toUpperCase());
    if (existing && existing.id !== id) {
      throw new AppError('Branch code already exists in this organization', { statusCode: 409, code: 'DUPLICATE_BRANCH_CODE' });
    }
  }

  return branchRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

async function deactivate(id, userId) {
  await getById(id, userId);
  return branchRepository.update(id, { status: 'inactive' });
}

export default { list, getById, create, update, deactivate };
