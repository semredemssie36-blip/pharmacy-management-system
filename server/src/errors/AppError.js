/**
 * Base application error. All expected/known errors should extend this
 * (or set the same shape) so the centralized error handler can produce
 * consistent JSON responses.
 */
class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details = undefined } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export default AppError;
