import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { closePool } from './database/pool.js';

const server = app.listen(env.port, () => {
  logger.info(`pharmacy-erp-server listening`, {
    port: env.port,
    env: env.nodeEnv,
  });

  if (env.missingDatabaseEnv.length > 0) {
    logger.warn('Some DATABASE_* environment variables are not set; DB features will fail until configured.', {
      missing: env.missingDatabaseEnv,
    });
  }
});

async function shutdown(signal) {
  logger.info(`received ${signal}, shutting down`);
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
