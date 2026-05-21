import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (error) {
    console.warn(
      '[MigrationRunner] Could not enable pgvector extension:',
      error instanceof Error ? error.message : String(error),
    );
  }

  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, '../../../drizzle');
  await migrate(db, { migrationsFolder });

  console.log('[MigrationRunner] Migrations applied successfully');
}
