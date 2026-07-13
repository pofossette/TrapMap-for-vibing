import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertGovernanceReviewMigrationSet(folder = migrationsFolder): Promise<void> {
  await assertOwnerMigrationSet('governance-review', folder, ['0000_shiny_swarm']);
}
export async function runGovernanceReviewMigrations(pool: Pool): Promise<void> {
  await assertGovernanceReviewMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
