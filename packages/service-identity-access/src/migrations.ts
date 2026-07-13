import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

export async function assertIdentityAccessMigrationSet(folder = migrationsFolder): Promise<void> {
  await assertOwnerMigrationSet('identity-access', folder, ['0000_identity_access_baseline']);
}

export async function runIdentityAccessMigrations(pool: Pool): Promise<void> {
  await assertIdentityAccessMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
