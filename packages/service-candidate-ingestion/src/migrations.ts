import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertCandidateIngestionMigrationSet(
  folder = migrationsFolder,
): Promise<void> {
  await assertOwnerMigrationSet('candidate-ingestion', folder, ['0000_colorful_silk_fever']);
}
export async function runCandidateIngestionMigrations(pool: Pool): Promise<void> {
  await assertCandidateIngestionMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
