import ValidationError from '../errors/ValidationError.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the login request body. */
function validateLogin(req, res, next) {
  const { email, password } = req.body ?? {};
  const details = [];

  if (typeof email !== 'string' || email.trim() === '') {
    details.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_RE.test(email.trim())) {
    details.push({ field: 'email', message: 'Email format is invalid' });
  }

  if (typeof password !== 'string' || password === '') {
    details.push({ field: 'password', message: 'Password is required' });
  }

  if (details.length > 0) {
    return next(new ValidationError('Validation failed', details));
  }

  req.body.email = email.trim().toLowerCase();
  next();
}

export default { validateLogin };
