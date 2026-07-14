import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';

import { assertKnowledgeWriteMigrationSet } from './migrations.js';

const temporaryDirectories: string[] = [];
async function createMigrationSet(files: string[], tags: string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), 'trapmap-write-migrations-'));
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
  await expect(assertKnowledgeWriteMigrationSet()).resolves.toBeUndefined();
});

it('keeps its Drizzle schema owner-local', () => {
  const source = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8');

  expect(source).not.toContain('@trapmap/server');
  expect(source).not.toContain('../../server/');
});

it('rejects external files and missing journal tags', async () => {
  const external = await createMigrationSet(
    ['0000_youthful_gargoyle.sql', '0000_identity_access_baseline.sql'],
    ['0000_youthful_gargoyle', '0000_identity_access_baseline'],
  );
  await expect(assertKnowledgeWriteMigrationSet(external)).rejects.toThrow(
    'unexpected=0000_identity_access_baseline',
  );
  const missing = await createMigrationSet(['0000_youthful_gargoyle.sql'], []);
  await expect(assertKnowledgeWriteMigrationSet(missing)).rejects.toThrow(
    'missing=0000_youthful_gargoyle',
  );
});
