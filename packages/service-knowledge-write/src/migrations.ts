import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
export async function assertKnowledgeWriteMigrationSet(): Promise<void> {
  const files = (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql'));
  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  const names = new Set(files.map((file) => file.slice(0, -4)));
  const tags = new Set(journal.entries.map(({ tag }) => tag));
  if ([...names].some((name) => !tags.has(name)) || [...tags].some((tag) => !names.has(tag)))
    throw new Error('knowledge-write migration journal mismatch');
}
export async function runKnowledgeWriteMigrations(pool: Pool): Promise<void> {
  await assertKnowledgeWriteMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
