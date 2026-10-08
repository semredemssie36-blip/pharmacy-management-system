import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Minimal controlled migration runner.
 * Applies *.sql files in filename order, tracking applied migrations
 * in schema_migrations. Never drops data.
 */
export async function runMigrations() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const [appliedRows] = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Split into statements — mysql2 does not allow multiple statements
    // per query by default, and our migrations contain no procedures.
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .filter((s) => s.length > 0);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      await connection.commit();
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await connection.rollback();
      throw new Error(`[migrate] failed on ${file}: ${err.message}`);
    } finally {
      connection.release();
    }
  }
}

// CLI entry: node src/database/migrate.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(err.message);
      await closePool();
      process.exit(1);
    });
}
