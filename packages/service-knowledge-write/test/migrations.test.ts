import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { taskQueueColumns } from '@trapmap/persistence-schema';
import { assertKnowledgeWriteMigrationSet } from '../src/migrations.js';

const temporaryDirectories: string[] = [];
// fallow-ignore-next-line code-duplication -- createMigrationSet helper is cloned across all six service migration tests; shared-helper extraction deferred
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

it('consumes the shared persistence schema as the single table source', async () => {
  const schema = await import('@trapmap/persistence-schema');

  expect(schema.skillArtifacts).toBeDefined();
  expect(schema.knowledgeEntries).toBeDefined();
  expect(schema.canonicalLabels).toBeDefined();
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

it('freezes the artifact revision version column in the owner migration set', async () => {
  const migration = readFileSync(
    new URL('../drizzle/0001_artifact_revision_version.sql', import.meta.url),
    'utf8',
  );
  expect(migration).toContain('ALTER TABLE "artifact_revisions" ADD COLUMN "version" text');

  const journal = JSON.parse(
    readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  expect(journal.entries.map((entry) => entry.tag)).toEqual([
    '0000_youthful_gargoyle',
    '0001_artifact_revision_version',
    '0002_experience_genes',
  ]);

  const snapshot = JSON.parse(
    readFileSync(new URL('../drizzle/meta/0001_snapshot.json', import.meta.url), 'utf8'),
  ) as {
    prevId: string;
    tables: Record<string, { columns: Record<string, { type: string; notNull: boolean }> }>;
  };
  const revisionTable = snapshot.tables['public.artifact_revisions'];
  expect(revisionTable?.columns.version).toEqual({
    name: 'version',
    type: 'text',
    primaryKey: false,
    notNull: false,
  });
});

it('freezes experience gene identity, governance, and projection indexes', () => {
  const migration = readFileSync(
    new URL('../drizzle/0002_experience_genes.sql', import.meta.url),
    'utf8',
  );

  expect(migration).toContain('"idempotency_key" text NOT NULL');
  expect(migration).toContain('CREATE UNIQUE INDEX "uq_experience_genes_active_idempotency"');
  expect(migration).toContain(
    "WHERE \"experience_genes\".\"status\" IN ('candidate', 'validated', 'solidified')",
  );
  expect(migration).toContain('"embedding" vector(384) NOT NULL');
  expect(migration).toContain('USING hnsw ("embedding" vector_cosine_ops)');
  expect(migration).toContain('ALTER COLUMN "document" TYPE tsvector');
  expect(migration).toContain('USING gin ("document")');
});

it('models the artifact revision version column in the shared schema', async () => {
  const schema = await import('@trapmap/persistence-schema');

  expect(schema.artifactRevisions.version).toBeDefined();
});

it('preserves every legacy knowledge aggregate in owner-local tables', () => {
  const migration = readFileSync(
    new URL('../drizzle/0000_youthful_gargoyle.sql', import.meta.url),
    'utf8',
  );

  for (const column of [
    '"metadata" jsonb',
    '"agent_review" jsonb',
    '"index_state" jsonb',
    '"decay_meta" jsonb',
    '"evidence_meta" jsonb',
    '"remediation" jsonb',
  ]) {
    expect(migration).toContain(column);
  }
  expect(migration).toContain('CREATE TABLE "knowledge_submissions"');
  expect(migration).toContain('CREATE TABLE "knowledge_review_decisions"');
});

it('rejects external files and missing journal tags', async () => {
  const external = await createMigrationSet(
    [
      '0000_youthful_gargoyle.sql',
      '0001_artifact_revision_version.sql',
      '0000_identity_access_baseline.sql',
    ],
    ['0000_youthful_gargoyle', '0001_artifact_revision_version', '0000_identity_access_baseline'],
  );
  await expect(assertKnowledgeWriteMigrationSet(external)).rejects.toThrow(
    'unexpected=0000_identity_access_baseline',
  );
  const missing = await createMigrationSet(
    ['0000_youthful_gargoyle.sql', '0001_artifact_revision_version.sql'],
    [],
  );
  await expect(assertKnowledgeWriteMigrationSet(missing)).rejects.toThrow(
    'missing=0000_youthful_gargoyle,0001_artifact_revision_version',
  );
});
