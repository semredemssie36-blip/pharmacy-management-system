import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import roleRepository from '../repositories/roleRepository.js';
import permissionRepository from '../repositories/permissionRepository.js';

const notFound = () => new AppError('Role not found', { statusCode: 404, code: 'ROLE_NOT_FOUND' });

async function list() {
  return roleRepository.findAll();
}

async function getById(id) {
  const role = await roleRepository.findById(id);
  if (!role) throw notFound();
  const permissions = await roleRepository.getRolePermissions(id);
  return { ...role, permissions };
}

async function create(input) {
  const details = [];
  if (typeof input.name !== 'string' || !input.name.trim()) details.push({ field: 'name', message: 'Name is required' });
  if (typeof input.code !== 'string' || !input.code.trim()) details.push({ field: 'code', message: 'Code is required' });
  if (details.length) throw new ValidationError('Validation failed', details);

  const existing = await roleRepository.findByCode(input.code.trim().toUpperCase());
  if (existing) throw new AppError('Role code already exists', { statusCode: 409, code: 'DUPLICATE_ROLE_CODE' });

  return roleRepository.create({
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    description: typeof input.description === 'string' ? input.description.trim() : null,
    status: input.status || 'active',
  });
}

async function update(id, input) {
  const role = await getById(id);
  const details = [];
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) {
    details.push({ field: 'name', message: 'Name must not be empty' });
  }
  if (input.code !== undefined && (typeof input.code !== 'string' || !input.code.trim())) {
    details.push({ field: 'code', message: 'Code must not be empty' });
  }
  if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) {
    details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
  }
  if (details.length) throw new ValidationError('Validation failed', details);

  if (input.code && input.code.trim().toUpperCase() !== role.code) {
    const existing = await roleRepository.findByCode(input.code.trim().toUpperCase());
    if (existing && existing.id !== id) throw new AppError('Role code already exists', { statusCode: 409, code: 'DUPLICATE_ROLE_CODE' });
  }

  return roleRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
}

async function deactivate(id) {
  await getById(id);
  return roleRepository.update(id, { status: 'inactive' });
}

async function setPermissions(roleId, permissionIds) {
  await getById(roleId);
  if (!Array.isArray(permissionIds)) {
    throw new ValidationError('Validation failed', [{ field: 'permissionIds', message: 'permissionIds must be an array' }]);
  }
  const found = await permissionRepository.findByIds(permissionIds);
  if (found.length !== new Set(permissionIds).size) {
    throw new AppError('One or more permissions do not exist', { statusCode: 404, code: 'PERMISSION_NOT_FOUND' });
  }
  await roleRepository.setRolePermissions(roleId, permissionIds);
  return getById(roleId);
}

export default { list, getById, create, update, deactivate, setPermissions };
