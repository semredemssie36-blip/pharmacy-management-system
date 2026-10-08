import AppError from './AppError.js';

/** Validation errors carry field-level details. */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

export default ValidationError;
