import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

export async function assertIdentityAccessMigrationSet(): Promise<void> {
  const migrations = (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql'));
  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  const tags = new Set(journal.entries.map(({ tag }) => tag));
  const names = new Set(migrations.map((file) => file.slice(0, -4)));
  const missing = [...names].filter((name) => !tags.has(name));
  const stale = [...tags].filter((tag) => !names.has(tag));
  if (missing.length || stale.length)
    throw new Error(
      `identity-access migration journal mismatch: missing=${missing.join(',')} stale=${stale.join(',')}`,
    );
}

export async function runIdentityAccessMigrations(pool: Pool): Promise<void> {
  await assertIdentityAccessMigrationSet();
  await migrate(drizzle(pool), { migrationsFolder });
}
