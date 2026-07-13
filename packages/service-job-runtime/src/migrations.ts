import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertJobRuntimeMigrationSet(folder = migrationsFolder): Promise<void> {
  await assertOwnerMigrationSet('job-runtime', folder, ['0000_sharp_old_lace']);
}
export async function runJobRuntimeMigrations(pool: Pool): Promise<void> {
  await assertJobRuntimeMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
