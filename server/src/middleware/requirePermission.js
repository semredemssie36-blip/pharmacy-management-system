import authorizationService from '../services/authorizationService.js';
import AppError from '../errors/AppError.js';

/**
 * Permission authorization middleware.
 * Requires authentication middleware to have run first (req.user set).
 * Never checks role names — only effective permissions.
 */
function requirePermission(code) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', { statusCode: 401, code: 'AUTHENTICATION_REQUIRED' }));
      }
      const permissions = await authorizationService.getUserPermissions(req.user.id);
      if (!permissions.includes(code)) {
        return next(new AppError('You do not have permission to perform this action.', { statusCode: 403, code: 'FORBIDDEN' }));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export default requirePermission;
