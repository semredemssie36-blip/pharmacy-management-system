import env from './env.js';

/**
 * Database connection configuration derived from environment variables.
 * The actual connection pool is created in src/database/pool.js.
 */
const databaseConfig = {
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
};

export default databaseConfig;
