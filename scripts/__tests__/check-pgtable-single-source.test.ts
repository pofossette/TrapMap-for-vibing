import { afterEach, describe, expect, it } from 'vitest';
import {
  checkNoPgTableCall,
  checkSchemaFile,
  scanServicePackages,
} from '../check-pgtable-single-source';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

describe('checkSchemaFile', () => {
  it('passes on a pure re-export schema.ts', () => {
    expect(
      checkSchemaFile('packages/service-a/src/schema.ts', "export * from '@trapmap/db';\n"),
    ).toEqual([]);
  });

  it('fails when schema.ts defines pgTable directly', () => {
    const content = [
      "import { pgTable, text } from 'drizzle-orm/pg-core';",
      "export const users = pgTable('users', { id: text('id').primaryKey() });",
    ].join('\n');
    const messages = checkSchemaFile('packages/service-a/src/schema.ts', content);
    expect(messages.some((m) => m.includes('defines pgTable('))).toBe(true);
  });

  it('fails when schema.ts does not re-export persistence-schema', () => {
    const messages = checkSchemaFile(
      'packages/service-a/src/schema.ts',
      "export * from './local-tables.js';\n",
    );
    expect(messages.some((m) => m.includes('does not re-export'))).toBe(true);
  });
});

describe('checkNoPgTableCall', () => {
  it('passes on service code without pgTable calls', () => {
    expect(
      checkNoPgTableCall('packages/service-a/src/pg-ports.ts', 'export const x = 1;\n'),
    ).toEqual([]);
  });

  it('fails when a non-schema service file calls pgTable', () => {
    const content = "export const t = pgTable('users', {});\n";
    const messages = checkNoPgTableCall('packages/service-a/src/pg-ports.ts', content);
    expect(messages.some((m) => m.includes('pgTable('))).toBe(true);
  });

  it('ignores pgTable mentioned inside comments', () => {
    const content = "// tables used to be defined here: pgTable('users', ...)\nconst x = 1;\n";
    expect(checkNoPgTableCall('packages/service-a/src/foo.ts', content)).toEqual([]);
  });
});

describe('scanServicePackages', () => {
  it('passes when all schema.ts files are pure re-exports', () => {
    const root = makeTempRepo('trapmap-pgtable-');
    write(root, 'packages/service-a/src/schema.ts', "export * from '@trapmap/db';\n");
    write(root, 'packages/service-a/src/pg-ports.ts', 'export const a = 1;\n');
    write(root, 'packages/service-b/src/schema.ts', "export * from '@trapmap/db';\n");

    expect(scanServicePackages(root)).toEqual([]);
  });

  it('fails on a direct pgTable definition inside a service package', () => {
    const root = makeTempRepo('trapmap-pgtable-');
    write(root, 'packages/service-a/src/schema.ts', "export * from '@trapmap/db';\n");
    write(
      root,
      'packages/service-a/src/local-tables.ts',
      "import { pgTable, text } from 'drizzle-orm/pg-core';\nexport const users = pgTable('users', {});\n",
    );

    const messages = scanServicePackages(root);
    expect(messages.some((m) => m.includes('local-tables.ts'))).toBe(true);
  });

  it('does not scan non-service packages', () => {
    const root = makeTempRepo('trapmap-pgtable-');
    write(
      root,
      'packages/contracts/src/schema.ts',
      "import { pgTable } from 'drizzle-orm/pg-core';\nexport const x = pgTable('x', {});\n",
    );
    expect(scanServicePackages(root)).toEqual([]);
  });
});
