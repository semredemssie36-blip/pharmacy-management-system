import AppError from './AppError.js';

/** 401 — request is not authenticated. */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTHENTICATION_REQUIRED') {
    super(message, { statusCode: 401, code });
  }
}

export default AuthenticationError;
