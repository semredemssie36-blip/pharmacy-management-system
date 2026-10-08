import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import warehouseRepository from '../repositories/warehouseRepository.js';
import branchRepository from '../repositories/branchRepository.js';
import authorizationService from './authorizationService.js';

const notFound = () => new AppError('Warehouse not found', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });

function validateInput({ name, code, branchId }, { partial = false } = {}) {
  const details = [];
  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') details.push({ field: 'name', message: 'Name is required' });
  }
  if (!partial || code !== undefined) {
    if (typeof code !== 'string' || code.trim() === '') details.push({ field: 'code', message: 'Code is required' });
  }
  if (!partial || branchId !== undefined) {
    if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) {
      details.push({ field: 'branchId', message: 'A valid branchId is required' });
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
  if (filters?.branchId !== undefined) {
    const id = Number(filters.branchId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Must be a positive integer' }]);
    }
    normalized.branchId = id;
  }
  const rows = await warehouseRepository.findAll(normalized);
  if (!userId) return rows;
  const scope = await authorizationService.getUserScope(userId);
  return rows.filter((row) => authorizationService.canAccessWarehouse(scope, row));
}

async function getById(id, userId) {
  const warehouse = await warehouseRepository.findById(id);
  if (!warehouse) throw notFound();
  if (userId) await authorizationService.assertWarehouseAccess(userId, warehouse);
  return warehouse;
}

async function create(input, userId) {
  validateInput(input);
  validateStatus(input.status);

  const branch = await branchRepository.findById(Number(input.branchId));
  if (!branch) {
    throw new AppError('Branch does not exist', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  }
  if (branch.status !== 'active') {
    throw new AppError('Cannot create a warehouse under an inactive branch', { statusCode: 409, code: 'INACTIVE_PARENT' });
  }

  if (userId) {
    const scope = await authorizationService.getUserScope(userId);
    if (!authorizationService.canAccessBranch(scope, branch)) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  const code = input.code.trim().toUpperCase();
  const existing = await warehouseRepository.findByCode(branch.id, code);
  if (existing) {
    throw new AppError('Warehouse code already exists in this branch', { statusCode: 409, code: 'DUPLICATE_WAREHOUSE_CODE' });
  }

  return warehouseRepository.create({
    branchId: branch.id,
    name: input.name.trim(),
    code,
    status: input.status || 'active',
  });
}

async function update(id, input, userId) {
  const warehouse = await getById(id, userId);
  validateInput(input, { partial: true });
  validateStatus(input.status);

  if (input.code && input.code.trim().toUpperCase() !== warehouse.code) {
    const existing = await warehouseRepository.findByCode(warehouse.branch_id, input.code.trim().toUpperCase());
    if (existing && existing.id !== id) {
      throw new AppError('Warehouse code already exists in this branch', { statusCode: 409, code: 'DUPLICATE_WAREHOUSE_CODE' });
    }
  }

  return warehouseRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

async function deactivate(id, userId) {
  await getById(id, userId);
  return warehouseRepository.update(id, { status: 'inactive' });
}

export default { list, getById, create, update, deactivate };
