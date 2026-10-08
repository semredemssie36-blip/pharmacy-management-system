import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Centralized error handler.
 * Produces a consistent JSON error shape and never leaks stack traces
 * or secrets to clients in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isOperational = err.isOperational === true;
  const statusCode = err.statusCode || (err.name === 'SyntaxError' ? 400 : 500);

  if (!isOperational || statusCode >= 500) {
    logger.error('unhandled error', {
      method: req.method,
      path: req.originalUrl,
      message: err.message,
      stack: env.isProduction ? undefined : err.stack,
    });
  }

  const code = err.code || (statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR');

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: isOperational || statusCode < 500
        ? err.message
        : 'An unexpected error occurred',
      ...(err.details ? { details: err.details } : {}),
      ...(env.isProduction ? {} : statusCode >= 500 ? { stack: err.stack } : {}),
    },
  });
}

export default errorHandler;
