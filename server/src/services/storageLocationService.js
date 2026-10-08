import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import storageLocationRepository from '../repositories/storageLocationRepository.js';
import warehouseRepository from '../repositories/warehouseRepository.js';
import authorizationService from './authorizationService.js';

const CONDITIONS = ['normal', 'refrigerated', 'controlled'];

const notFound = () => new AppError('Storage location not found', { statusCode: 404, code: 'STORAGE_LOCATION_NOT_FOUND' });

function validateInput({ name, code, warehouseId, storageCondition }, { partial = false } = {}) {
  const details = [];
  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') details.push({ field: 'name', message: 'Name is required' });
  }
  if (!partial || code !== undefined) {
    if (typeof code !== 'string' || code.trim() === '') details.push({ field: 'code', message: 'Code is required' });
  }
  if (!partial || warehouseId !== undefined) {
    if (!Number.isInteger(Number(warehouseId)) || Number(warehouseId) <= 0) {
      details.push({ field: 'warehouseId', message: 'A valid warehouseId is required' });
    }
  }
  if (storageCondition !== undefined && !CONDITIONS.includes(storageCondition)) {
    details.push({ field: 'storageCondition', message: `Must be one of: ${CONDITIONS.join(', ')}` });
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
  if (filters?.warehouseId !== undefined) {
    const id = Number(filters.warehouseId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'warehouseId', message: 'Must be a positive integer' }]);
    }
    normalized.warehouseId = id;
  }
  const rows = await storageLocationRepository.findAll(normalized);
  if (!userId) return rows;
  const scope = await authorizationService.getUserScope(userId);
  return rows.filter((row) => authorizationService.canAccessStorageLocation(scope, row));
}

async function getById(id, userId) {
  const location = await storageLocationRepository.findById(id);
  if (!location) throw notFound();
  if (userId) await authorizationService.assertStorageLocationAccess(userId, location);
  return location;
}

async function create(input, userId) {
  validateInput(input);
  validateStatus(input.status);

  const warehouse = await warehouseRepository.findById(Number(input.warehouseId));
  if (!warehouse) {
    throw new AppError('Warehouse does not exist', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });
  }
  if (warehouse.status !== 'active') {
    throw new AppError('Cannot create a storage location under an inactive warehouse', { statusCode: 409, code: 'INACTIVE_PARENT' });
  }

  if (userId) {
    const scope = await authorizationService.getUserScope(userId);
    if (!authorizationService.canAccessWarehouse(scope, warehouse)) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  const code = input.code.trim().toUpperCase();
  const existing = await storageLocationRepository.findByCode(warehouse.id, code);
  if (existing) {
    throw new AppError('Storage location code already exists in this warehouse', { statusCode: 409, code: 'DUPLICATE_STORAGE_LOCATION_CODE' });
  }

  return storageLocationRepository.create({
    warehouseId: warehouse.id,
    name: input.name.trim(),
    code,
    storageCondition: input.storageCondition || 'normal',
    status: input.status || 'active',
  });
}

async function update(id, input, userId) {
  const location = await getById(id, userId);
  validateInput(input, { partial: true });
  validateStatus(input.status);

  if (input.code && input.code.trim().toUpperCase() !== location.code) {
    const existing = await storageLocationRepository.findByCode(location.warehouse_id, input.code.trim().toUpperCase());
    if (existing && existing.id !== id) {
      throw new AppError('Storage location code already exists in this warehouse', { statusCode: 409, code: 'DUPLICATE_STORAGE_LOCATION_CODE' });
    }
  }

  return storageLocationRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.storageCondition !== undefined ? { storageCondition: input.storageCondition } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

async function deactivate(id, userId) {
  await getById(id, userId);
  return storageLocationRepository.update(id, { status: 'inactive' });
}

export default { list, getById, create, update, deactivate, CONDITIONS };
