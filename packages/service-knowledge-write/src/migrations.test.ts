import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';

import { taskQueueColumns } from '@trapmap/persistence-schema';
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

it('consumes the shared persistence schema instead of local table definitions', async () => {
  const schema = await import('@trapmap/persistence-schema');
  const source = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8');

  expect(schema.skillArtifacts).toBeDefined();
  expect(schema.knowledgeEntries).toBeDefined();
  expect(schema.canonicalLabels).toBeDefined();
  expect(source).toContain('@trapmap/persistence-schema');
});

it('uses the frozen shared task queue column shape', () => {
  expect(Object.keys(taskQueueColumns())).toEqual([
    'id',
    'type',
    'payload',
    'status',
    'priority',
    'attempts',
    'maxAttempts',
    'lastError',
    'dedupeKey',
    'processAfter',
    'workerId',
    'startedAt',
    'heartbeatAt',
    'leaseUntil',
    'createdAt',
    'updatedAt',
    'completedAt',
  ]);
});

it('freezes artifact roundtrip columns and lookup indexes in the owner migration', () => {
  const migration = readFileSync(
    new URL('../drizzle/0000_youthful_gargoyle.sql', import.meta.url),
    'utf8',
  );

  for (const column of [
    '"labels" jsonb',
    '"metadata" jsonb',
    '"agent_review" jsonb',
    '"maintenance_meta" jsonb',
    '"derived" jsonb',
    '"state" text',
  ]) {
    expect(migration).toContain(column);
  }
  for (const index of [
    'idx_artifact_lifecycle_events_artifact',
    'idx_artifact_revisions_artifact_revision_no',
    'idx_skill_artifacts_lifecycle_state',
    'idx_skill_artifacts_scope_team_slug',
  ]) {
    expect(migration).toContain(index);
  }
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
