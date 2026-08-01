import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { assertGovernanceReviewMigrationSet } from './migrations.js';

const temporaryDirectories: string[] = [];
async function createMigrationSet(files: string[], tags: string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), 'trapmap-governance-migrations-'));
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
  await expect(assertGovernanceReviewMigrationSet()).resolves.toBeUndefined();
});

it('rejects external files and missing journal tags', async () => {
  const external = await createMigrationSet(
    ['0000_shiny_swarm.sql', '0000_identity_access_baseline.sql'],
    ['0000_shiny_swarm', '0000_identity_access_baseline'],
  );
  await expect(assertGovernanceReviewMigrationSet(external)).rejects.toThrow(
    'unexpected=0000_identity_access_baseline',
  );
  const missing = await createMigrationSet(['0000_shiny_swarm.sql'], []);
  await expect(assertGovernanceReviewMigrationSet(missing)).rejects.toThrow(
    'missing=0000_shiny_swarm',
  );
});
