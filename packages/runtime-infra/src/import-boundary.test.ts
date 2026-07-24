import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expectFilesFreeOfImports } from '../../../scripts/testing/import-boundary.js';

const FILES = ['src/shared-infra.ts', 'src/store-factory.ts', 'src/postgres-store.ts'];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/persistence/create-store',
  '@trapmap/server/lib/persistence/postgres-store',
  '@trapmap/server/lib/store',
  '@trapmap/server/lib/repos/index',
  '@trapmap/server/lib/runtime/runtime-contract',
  '@trapmap/server/lib/runtime/metrics',
  '@trapmap/server/lib/indexing/adapters',
  '@trapmap/server/lib/indexing/registry',
];

describe('runtime-infra import boundary', () => {
  it('does not import compatibility implementations', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    await expectFilesFreeOfImports(root, FILES, FORBIDDEN_IMPORTS, (source, forbidden) => {
      expect(source).not.toContain(forbidden);
    });
  });

  it('keeps shared infra on structural store seams', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const source = await readFile(path.join(root, 'src/shared-infra.ts'), 'utf-8');

    expect(source).not.toContain('./postgres-store.js');
    expect(source).not.toContain('instanceof PostgresStore');
  });

  it('accepts graph projection persistence through a host-owned factory', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const source = await readFile(path.join(root, 'src/shared-infra.ts'), 'utf-8');

    expect(source).toContain('graphIndexRepositoryFactory');
    expect(source).toContain('config.graphIndexRepositoryFactory(pool)');
    expect(source).not.toContain('@trapmap/service-knowledge-read');
    expect(source).not.toContain('@trapmap/server/lib/graph-index');
  });
});

it('does not retain knowledge-read assembly files', async () => {
  const root = path.resolve(import.meta.dirname, '..');

  await expect(
    readFile(path.join(root, 'src/knowledge-read-support-infra.ts'), 'utf-8'),
  ).rejects.toThrow();
  await expect(
    readFile(path.join(root, 'src/knowledge-read-retrieval-infra.ts'), 'utf-8'),
  ).rejects.toThrow();
});
