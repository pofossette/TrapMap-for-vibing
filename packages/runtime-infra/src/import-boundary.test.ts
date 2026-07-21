import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FILES = [
  'src/shared-infra.ts',
  'src/store-factory.ts',
  'src/postgres-store.ts',
  'src/knowledge-read-support-infra.ts',
  'src/knowledge-read-retrieval-infra.ts',
];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/persistence/create-store',
  '@trapmap/server/lib/persistence/postgres-store',
  '@trapmap/server/lib/store',
  '@trapmap/server/lib/repos/index',
  '@trapmap/server/lib/runtime/runtime-contract',
  '@trapmap/server/lib/runtime/metrics',
];

describe('runtime-infra import boundary', () => {
  it('does not import compatibility implementations', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    for (const file of FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('keeps shared infra on structural store seams', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const source = await readFile(path.join(root, 'src/shared-infra.ts'), 'utf-8');

    expect(source).not.toContain('./postgres-store.js');
    expect(source).not.toContain('instanceof PostgresStore');
  });
});
