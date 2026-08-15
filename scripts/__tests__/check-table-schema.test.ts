import { afterEach, describe, expect, it } from 'vitest';
import {
  checkTableSchema,
  extractSchemaTableNames,
  parseDocTableInventory,
} from '../check-table-schema';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

function writeSchemaTable(root: string, file: string, tableName: string): void {
  write(
    root,
    `packages/persistence-schema/src/${file}`,
    [
      "import { pgTable, text } from 'drizzle-orm/pg-core';",
      '',
      'export const t = pgTable(',
      `  '${tableName}',`,
      "  { id: text('id').primaryKey() },",
      ');',
      '',
    ].join('\n'),
  );
}

describe('extractSchemaTableNames', () => {
  it('collects every pgTable name across schema files', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    writeSchemaTable(root, 'a.ts', 'users');
    writeSchemaTable(root, 'b.ts', 'teams');
    writeSchemaTable(root, 'c.ts', 'memberships');

    expect(extractSchemaTableNames(root)).toEqual(['memberships', 'teams', 'users']);
  });

  it('returns an empty list when the schema dir is missing', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    expect(extractSchemaTableNames(root)).toEqual([]);
  });
});

describe('parseDocTableInventory', () => {
  it('parses table rows grouped by section with declared counts', () => {
    const doc = [
      '## 表总览 (2 张表)',
      '',
      '### 域A (1 表)',
      '',
      '| 表名 | 用途 | 主键 |',
      '|------|------|------|',
      '| `users` | 用户 | `id` |',
      '',
      '### 域B (1 表)',
      '',
      '| 表名 | 用途 | 主键 |',
      '|------|------|------|',
      '| `teams` | 团队 | `id` |',
    ].join('\n');

    const inventory = parseDocTableInventory(doc);
    expect(inventory.declaredTotal).toBe(2);
    expect(inventory.tables).toEqual(['teams', 'users']);
    expect(inventory.sections).toEqual([
      { title: '域A (1 表)', declared: 1, tables: ['users'] },
      { title: '域B (1 表)', declared: 1, tables: ['teams'] },
    ]);
  });

  it('excludes `_idx` index rows from the inventory', () => {
    const doc = [
      '### 域A (1 表)',
      '',
      '| `users` | 用户 | `id` |',
      '',
      '### task_queue 关键索引',
      '',
      '| `task_queue_dedupe_pending_idx` | 唯一部分索引 | `(type, dedupe_key)` |',
    ].join('\n');

    const inventory = parseDocTableInventory(doc);
    expect(inventory.tables).toEqual(['users']);
    expect(inventory.sections).toHaveLength(1);
  });
});

describe('checkTableSchema', () => {
  function expectFailures(root: string, doc: string, ...needles: string[]): void {
    write(root, 'docs/reference/DATABASE_SCHEMA.md', doc);
    const result = checkTableSchema(root, doc);
    expect(result.failures).toBeGreaterThan(0);
    for (const needle of needles) {
      expect(result.messages.some((m) => m.includes(needle))).toBe(true);
    }
  }

  it('passes when schema and doc inventories match', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    writeSchemaTable(root, 'a.ts', 'users');
    writeSchemaTable(root, 'b.ts', 'teams');
    const doc = [
      '## 表总览 (2 张表)',
      '',
      '### 域A (2 表)',
      '',
      '| `users` | 用户 | `id` |',
      '| `teams` | 团队 | `id` |',
    ].join('\n');
    write(root, 'docs/reference/DATABASE_SCHEMA.md', doc);

    const result = checkTableSchema(root, doc);
    expect(result.failures).toBe(0);
    expect(result.messages).toEqual([]);
  });

  it('fails when a schema table is missing from the doc', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    writeSchemaTable(root, 'a.ts', 'users');
    writeSchemaTable(root, 'b.ts', 'teams');
    expectFailures(
      root,
      ['### 域A (1 表)', '', '| `users` | 用户 | `id` |'].join('\n'),
      'MISSING',
      'teams',
    );
  });

  it('fails on a ghost table declared in the doc but not modeled', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    writeSchemaTable(root, 'a.ts', 'users');
    expectFailures(
      root,
      [
        '### 域A (2 表)',
        '',
        '| `users` | 用户 | `id` |',
        '| `store_snapshot` | 幽灵表 | `id` |',
      ].join('\n'),
      'GHOST',
      'store_snapshot',
    );
  });

  it('fails when a section declares a count that does not match its rows', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    writeSchemaTable(root, 'a.ts', 'users');
    writeSchemaTable(root, 'b.ts', 'teams');
    expectFailures(
      root,
      ['### 域A (5 表)', '', '| `users` | 用户 | `id` |', '| `teams` | 团队 | `id` |'].join('\n'),
      'SECTION COUNT',
    );
  });

  it('fails when the doc total diverges from the schema count', () => {
    const root = makeTempRepo('trapmap-table-schema-');
    writeSchemaTable(root, 'a.ts', 'users');
    expectFailures(
      root,
      ['## 表总览 (64 张表)', '', '### 域A (1 表)', '', '| `users` | 用户 | `id` |'].join('\n'),
      'TOTAL MISMATCH',
    );
  });
});
