import bcrypt from 'bcryptjs';

import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import userRepository from '../repositories/userRepository.js';
import roleRepository from '../repositories/roleRepository.js';
import organizationRepository from '../repositories/organizationRepository.js';
import branchRepository from '../repositories/branchRepository.js';
import warehouseRepository from '../repositories/warehouseRepository.js';
import authorizationService from './authorizationService.js';
import userScopeRepository from '../repositories/userScopeRepository.js';

const SAFE_FIELDS = 'id, name, email, status, created_at, updated_at';

function toSafe(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

const notFound = () => new AppError('User not found', { statusCode: 404, code: 'USER_NOT_FOUND' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function list() {
  const users = await userRepository.findAll();
  return Promise.all(
    users.map(async (user) => ({
      ...toSafe(user),
      roles: await authorizationService.getUserRoles(user.id),
    })),
  );
}

async function getById(id) {
  const user = await userRepository.findById(id);
  if (!user) throw notFound();
  const [roles, scopes] = await Promise.all([
    authorizationService.getUserRoles(id),
    userScopeRepository.findByUserId(id),
  ]);
  return { ...toSafe(user), roles, scopes };
}

async function create(input) {
  const details = [];
  if (typeof input.name !== 'string' || !input.name.trim()) details.push({ field: 'name', message: 'Name is required' });
  if (typeof input.email !== 'string' || !EMAIL_RE.test(input.email.trim())) details.push({ field: 'email', message: 'Valid email is required' });
  if (typeof input.password !== 'string' || input.password.length < 8) details.push({ field: 'password', message: 'Password must be at least 8 characters' });
  if (details.length) throw new ValidationError('Validation failed', details);

  const existing = await userRepository.findByEmail(input.email.trim().toLowerCase());
  if (existing) {
    throw new AppError('Email is already in use', { statusCode: 409, code: 'DUPLICATE_USER_EMAIL' });
  }

  const user = await userRepository.create({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(input.password, 10),
    status: input.status || 'active',
  });
  return toSafe(user);
}

async function update(id, input) {
  await getById(id);
  const details = [];
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) {
    details.push({ field: 'name', message: 'Name must not be empty' });
  }
  if (input.email !== undefined && (typeof input.email !== 'string' || !EMAIL_RE.test(input.email.trim()))) {
    details.push({ field: 'email', message: 'Valid email is required' });
  }
  if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) {
    details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
  }
  if (details.length) throw new ValidationError('Validation failed', details);

  if (input.email) {
    const existing = await userRepository.findByEmail(input.email.trim().toLowerCase());
    if (existing && existing.id !== id) {
      throw new AppError('Email is already in use', { statusCode: 409, code: 'DUPLICATE_USER_EMAIL' });
    }
  }

  const user = await userRepository.update(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  return toSafe(user);
}

async function deactivate(id) {
  await getById(id);
  return toSafe(await userRepository.update(id, { status: 'inactive' }));
}

async function activate(id) {
  await getById(id);
  return toSafe(await userRepository.update(id, { status: 'active' }));
}

async function setRoles(userId, roleIds) {
  await getById(userId);
  if (!Array.isArray(roleIds)) {
    throw new ValidationError('Validation failed', [{ field: 'roleIds', message: 'roleIds must be an array' }]);
  }
  const roles = [];
  for (const roleId of roleIds) {
    const role = await roleRepository.findById(roleId);
    if (!role) throw new AppError('Role does not exist', { statusCode: 404, code: 'ROLE_NOT_FOUND' });
    if (role.status !== 'active') {
      throw new AppError('Cannot assign an inactive role', { statusCode: 409, code: 'INACTIVE_ROLE' });
    }
    roles.push(role);
  }
  await authorizationService.setUserRoles(userId, roleIds);
  return getById(userId);
}

async function setScopes(userId, scopes) {
  await getById(userId);
  if (!Array.isArray(scopes)) {
    throw new ValidationError('Validation failed', [{ field: 'scopes', message: 'scopes must be an array' }]);
  }
  const TYPES = ['organization', 'branch', 'warehouse'];
  for (const scope of scopes) {
    if (!TYPES.includes(scope.scopeType)) {
      throw new ValidationError('Validation failed', [{ field: 'scopeType', message: `Must be one of ${TYPES.join(', ')}` }]);
    }
    if (scope.scopeType === 'organization') {
      if (!Number.isInteger(scope.organizationId)) throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Required for organization scope' }]);
      const org = await organizationRepository.findById(scope.organizationId);
      if (!org) throw new AppError('Organization does not exist', { statusCode: 404, code: 'ORGANIZATION_NOT_FOUND' });
    } else if (scope.scopeType === 'branch') {
      if (!Number.isInteger(scope.branchId)) throw new ValidationError('Validation failed', [{ field: 'branchId', message: 'Required for branch scope' }]);
      const branch = await branchRepository.findById(scope.branchId);
      if (!branch) throw new AppError('Branch does not exist', { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
    } else {
      if (!Number.isInteger(scope.warehouseId)) throw new ValidationError('Validation failed', [{ field: 'warehouseId', message: 'Required for warehouse scope' }]);
      const warehouse = await warehouseRepository.findById(scope.warehouseId);
      if (!warehouse) throw new AppError('Warehouse does not exist', { statusCode: 404, code: 'WAREHOUSE_NOT_FOUND' });
    }
  }
  await userScopeRepository.replaceForUser(userId, scopes);
  return getById(userId);
}

export default { list, getById, create, update, deactivate, activate, setRoles, setScopes, SAFE_FIELDS };
