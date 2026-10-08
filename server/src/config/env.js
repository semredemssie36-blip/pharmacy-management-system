import dotenv from 'dotenv';

dotenv.config();

const required = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'JWT_SECRET',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0 && process.env.NODE_ENV === 'production') {
  // In production, fail fast on missing critical configuration.
  // In development we allow startup so /api/health can report DB status
  // without forcing a live database connection.
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number.parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT, 10) || 3306,
    name: process.env.DATABASE_NAME || 'pharmacy_erp',
    user: process.env.DATABASE_USER || '',
    password: process.env.DATABASE_PASSWORD || '',
  },
  missingDatabaseEnv: missing,
  auth: {
    // Development fallback keeps local setup easy; production must set JWT_SECRET.
    jwtSecret:
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === 'production' ? '' : 'insecure-dev-secret-change-me'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    cookieName: process.env.AUTH_COOKIE_NAME || 'pharmacy_erp_auth',
    // 'lax' works for same-origin and typical same-site deployments.
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || 'lax',
    cookieSecure:
      process.env.AUTH_COOKIE_SECURE != null
        ? process.env.AUTH_COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
  },
};

export default env;
