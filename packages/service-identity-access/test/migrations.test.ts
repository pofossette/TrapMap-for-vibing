import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { assertIdentityAccessMigrationSet } from '../src/migrations.js';

const temporaryDirectories: string[] = [];

async function createMigrationSet(files: string[], tags: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'trapmap-identity-migrations-'));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, 'meta'));
  await Promise.all(files.map((file) => writeFile(path.join(directory, file), '-- migration')));
  await writeFile(
    path.join(directory, 'meta', '_journal.json'),
    JSON.stringify({ entries: tags.map((tag) => ({ tag })) }),
  );
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

it('uses its complete owner-local migration set', async () => {
  await expect(assertIdentityAccessMigrationSet()).resolves.toBeUndefined();
});

it('rejects an owner-external migration file', async () => {
  const directory = await createMigrationSet(
    ['0000_identity_access_baseline.sql', '0000_knowledge_write_baseline.sql'],
    ['0000_identity_access_baseline', '0000_knowledge_write_baseline'],
  );

  await expect(assertIdentityAccessMigrationSet(directory)).rejects.toThrow(
    'unexpected=0000_knowledge_write_baseline',
  );
});

it('rejects a migration missing from the Drizzle journal', async () => {
  const directory = await createMigrationSet(['0000_identity_access_baseline.sql'], []);

  await expect(assertIdentityAccessMigrationSet(directory)).rejects.toThrow(
    'missing=0000_identity_access_baseline',
  );
});
