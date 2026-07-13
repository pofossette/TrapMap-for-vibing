import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertKnowledgeWriteMigrationSet(folder = migrationsFolder): Promise<void> {
  await assertOwnerMigrationSet('knowledge-write', folder, ['0000_youthful_gargoyle']);
}
export async function runKnowledgeWriteMigrations(pool: Pool): Promise<void> {
  await assertKnowledgeWriteMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
