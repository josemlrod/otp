import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadMigrations } from 'remix/data-table/migrations/node';
import { createSqliteDatabase } from 'remix/data-table/sqlite';

const ROOT_DIR = path.join(import.meta.dirname, '..');

function databaseFilename() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.NODE_ENV === 'test') return ':memory:';
  return path.join(ROOT_DIR, 'db', 'otp.sqlite');
}

const filename = databaseFilename();
if (filename !== ':memory:') {
  mkdirSync(path.dirname(filename), { recursive: true });
}

export const db = createSqliteDatabase({ filename });

export async function migrateDatabase() {
  const migrations = await loadMigrations(path.join(ROOT_DIR, 'db', 'migrations'));
  await db.migrate(migrations);
}
