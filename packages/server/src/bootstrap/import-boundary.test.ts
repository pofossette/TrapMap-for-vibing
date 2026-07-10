import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const BOOTSTRAP_FILES = [
  'bootstrap-repositories.ts',
  'bootstrap-lifecycle.ts',
  'bootstrap-workers.ts',
  'bootstrap-candidate-recovery.ts',
];

describe('bootstrap import boundary', () => {
  it('uses the store pool seam instead of concrete PostgresStore checks', async () => {
    const root = import.meta.dirname;

    for (const file of BOOTSTRAP_FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      expect(source).not.toContain('@trapmap/server/lib/persistence/postgres-store.js');
      expect(source).not.toContain('instanceof PostgresStore');
    }
  });
});
