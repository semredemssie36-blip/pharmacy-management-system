import ValidationError from '../errors/ValidationError.js';

/** Parses a positive-integer route param or throws a validation error. */
export function parseIdParam(value, field = 'id') {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Validation failed', [{ field, message: 'Must be a positive integer' }]);
  }
  return id;
}
