import env from '../config/env.js';
import authService from '../services/authService.js';
import AuthenticationError from '../errors/AuthenticationError.js';

/**
 * Authentication middleware.
 * Responsibility: "Is this request authenticated, and which user is it?"
 * It attaches req.user. It does NOT do roles, permissions, scope, or approval checks.
 */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[env.auth.cookieName];
    if (!token) {
      throw new AuthenticationError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    req.user = await authService.getUserByToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export default authenticate;
