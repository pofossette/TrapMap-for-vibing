import { existsSync, readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

import {
  assertKnowledgeWriteMigrationSet,
  runKnowledgeWriteMigrations,
} from '../src/migrations.js';

it('assertKnowledgeWriteMigrationSet is deprecated no-op', async () => {
  await expect(assertKnowledgeWriteMigrationSet()).resolves.toBeUndefined();
  await expect(assertKnowledgeWriteMigrationSet('/tmp' as any)).resolves.toBeUndefined();
});

it('runKnowledgeWriteMigrations delegates to @trapmap/db runMigrations', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const pool = { query } as any;
  // Mock the db migration to use a temp file so we don't need real schema
  // But the real runMigrations will read packages/db/migrations/schema.sql which exists
  // We just verify it does not throw for a mock pool that succeeds
  // and that it calls query at least once (schema.sql has many statements)
  await expect(runKnowledgeWriteMigrations(pool)).resolves.toBeUndefined();
  expect(query).toHaveBeenCalled();
});

it('db schema.sql exists and contains core tables', async () => {
  const sqlPath = 'packages/db/migrations/schema.sql';
  expect(existsSync(sqlPath)).toBe(true);
  const sql = readFileSync(sqlPath, 'utf8');
  expect(sql).toContain('CREATE TABLE');
  expect(sql).toContain('knowledge_entries');
  expect(sql).toContain('skill_artifacts');
  expect(sql).toContain('task_queue');
});
