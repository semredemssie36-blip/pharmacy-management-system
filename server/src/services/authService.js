import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import env from '../config/env.js';
import authRepository from '../repositories/authRepository.js';
import userScopeRepository from '../repositories/userScopeRepository.js';
import AuthenticationError from '../errors/AuthenticationError.js';
import AppError from '../errors/AppError.js';
import authorizationService from './authorizationService.js';
import auditService from './auditService.js';
import { getPool } from '../database/pool.js';

export async function resolveUserOrgId(userId) {
  try {
    const scopes = await userScopeRepository.findByUserId(userId);
    const directOrg = scopes.find((s) => s.scope_type === 'organization' && s.organization_id);
    if (directOrg) return directOrg.organization_id;

    const branchScope = scopes.find((s) => s.scope_type === 'branch' && s.branch_id);
    if (branchScope) {
      const [b] = await getPool().query('SELECT organization_id FROM branches WHERE id = ?', [branchScope.branch_id]);
      if (b[0]?.organization_id) return b[0].organization_id;
    }

    const [orgs] = await getPool().query('SELECT id FROM organizations ORDER BY id ASC LIMIT 1');
    return orgs[0]?.id || 1;
  } catch {
    return 1;
  }
}

/** Shape of the user object returned to clients — no secrets, ever. */
function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
  };
}

/** Safe user plus current effective authorization info (for /auth/me). */
async function toSafeUserWithAuthorization(user) {
  const [roles, permissions] = await Promise.all([
    authorizationService.getUserRoles(user.id),
    authorizationService.getUserPermissions(user.id),
  ]);
  return {
    ...toSafeUser(user),
    roles: roles.filter((r) => r.status === 'active').map((r) => ({ id: r.id, name: r.name, code: r.code })),
    permissions,
  };
}

async function login({ email, password }, ipAddress = null) {
  const user = await authRepository.findByEmail(email);

  // Generic message — do not reveal whether the email exists.
  const invalid = () =>
    new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');

  if (!user) {
    const [defaultOrg] = await getPool().query('SELECT id FROM organizations ORDER BY id ASC LIMIT 1').catch(() => [[]]);
    const orgId = defaultOrg[0]?.id || 1;
    await auditService.log({
      organizationId: orgId,
      action: 'auth.failed_login',
      resourceType: 'auth',
      outcome: 'failure',
      reason: 'Invalid credentials: unknown user email',
      details: { attemptedEmail: email ? String(email).trim() : null },
      ipAddress,
    }).catch(() => {});
    throw invalid();
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const orgId = await resolveUserOrgId(user.id);
    await auditService.log({
      organizationId: orgId,
      actorUserId: user.id,
      action: 'auth.failed_login',
      resourceType: 'auth',
      resourceId: user.id,
      outcome: 'failure',
      reason: 'Invalid credentials: password mismatch',
      details: { attemptedEmail: user.email },
      ipAddress,
    }).catch(() => {});
    throw invalid();
  }

  if (user.status !== 'active') {
    const orgId = await resolveUserOrgId(user.id);
    await auditService.log({
      organizationId: orgId,
      actorUserId: user.id,
      action: 'auth.failed_login',
      resourceType: 'auth',
      resourceId: user.id,
      outcome: 'failure',
      reason: 'Account inactive',
      details: { attemptedEmail: user.email },
      ipAddress,
    }).catch(() => {});
    throw new AppError('Account is inactive', {
      statusCode: 403,
      code: 'ACCOUNT_INACTIVE',
    });
  }

  const token = jwt.sign({ sub: user.id }, env.auth.jwtSecret, {
    expiresIn: env.auth.jwtExpiresIn,
  });

  const orgId = await resolveUserOrgId(user.id);
  await auditService.log({
    organizationId: orgId,
    actorUserId: user.id,
    action: 'auth.login',
    resourceType: 'auth',
    resourceId: user.id,
    outcome: 'success',
    details: { email: user.email },
    ipAddress,
  }).catch(() => {});

  return { user: await toSafeUserWithAuthorization(user), token };
}

async function getUserByToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.auth.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthenticationError('Session expired', 'AUTHENTICATION_EXPIRED');
    }
    throw new AuthenticationError('Invalid authentication state', 'AUTHENTICATION_INVALID');
  }

  const user = await authRepository.findById(payload.sub);
  if (!user) {
    throw new AuthenticationError('Invalid authentication state', 'AUTHENTICATION_INVALID');
  }
  if (user.status !== 'active') {
    throw new AppError('Account is inactive', {
      statusCode: 403,
      code: 'ACCOUNT_INACTIVE',
    });
  }

  return toSafeUserWithAuthorization(user);
}

export default { login, getUserByToken, toSafeUser };
