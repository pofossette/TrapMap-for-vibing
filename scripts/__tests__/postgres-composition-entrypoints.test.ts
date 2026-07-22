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
  it('injects the job-runtime port into the compatibility composition', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('createJobRuntimeModule');
    expect(source).toMatch(/jobRuntime:\s*createJobRuntimeModule\(/);
  });

  it('injects the job-runtime outbox worker factory into compatibility composition', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('createJobRuntimeOutboxConsumer');
    expect(source).toMatch(/outboxWorkerFactory:\s*\{\s*create:/);
  });

  it('injects the governance retrieval projection into the compatibility composition', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('createGovernanceReviewPgOwnerBundle');
    expect(source).toMatch(
      /governanceRetrievalProjection:\s*governanceReview\.retrievalProjection/,
    );
  });

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
