import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertCronMigrationSet(folder = migrationsFolder): Promise<void> {
  await assertOwnerMigrationSet('cron', folder, ['0000_cron_jobs']);
}
export async function runCronMigrations(pool: Pool): Promise<void> {
  await assertCronMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
