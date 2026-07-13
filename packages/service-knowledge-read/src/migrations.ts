import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnerMigrationSet } from '@trapmap/backend-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertKnowledgeReadMigrationSet(folder = migrationsFolder): Promise<void> {
  await assertOwnerMigrationSet('knowledge-read', folder, ['0000_sharp_talos']);
}
export async function runKnowledgeReadMigrations(pool: Pool): Promise<void> {
  await assertKnowledgeReadMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
