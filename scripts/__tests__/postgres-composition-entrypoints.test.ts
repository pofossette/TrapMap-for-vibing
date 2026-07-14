import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const entrypoints = [
  'scripts/export-retrieval-db-snapshot.ts',
  'evals/retrieval-live/lib/snapshot-orchestrator.ts',
  'packages/server/scripts/benchmark-graph-backend.ts',
  'scripts/test-skill-import-export.ts',
];

const cleanupProtectedEntrypoints = [
  'evals/retrieval-live/lib/snapshot-orchestrator.ts',
  'scripts/test-skill-import-export.ts',
];

describe('PostgreSQL composition entrypoints', () => {
  it.each(entrypoints)('%s uses host PostgreSQL composition', async (entrypoint) => {
    const source = await readFile(path.resolve(entrypoint), 'utf8');

    expect(source).toContain('buildPostgresComposedServer');
    expect(source).not.toMatch(/\bbuildServer\s*\(/);
    expect(source).toContain('PostgreSQL host composition');
  });

  it.each(cleanupProtectedEntrypoints)(
    '%s closes its host pool when readiness fails',
    async (entrypoint) => {
      const source = await readFile(path.resolve(entrypoint), 'utf8');

      expect(source).toMatch(/try\s*\{\s*await app\.ready\(\);/);
    },
  );
});
