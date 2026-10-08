import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import env from '../config/env.js';
import authRepository from '../repositories/authRepository.js';
import AuthenticationError from '../errors/AuthenticationError.js';
import AppError from '../errors/AppError.js';
import authorizationService from './authorizationService.js';

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

async function login({ email, password }) {
  const user = await authRepository.findByEmail(email);

  // Generic message — do not reveal whether the email exists.
  const invalid = () =>
    new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');

  if (!user) throw invalid();

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) throw invalid();

  if (user.status !== 'active') {
    throw new AppError('Account is inactive', {
      statusCode: 403,
      code: 'ACCOUNT_INACTIVE',
    });
  }

  const token = jwt.sign({ sub: user.id }, env.auth.jwtSecret, {
    expiresIn: env.auth.jwtExpiresIn,
  });

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
