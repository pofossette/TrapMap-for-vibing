import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const entrypoints = ['evals/retrieval-live/lib/snapshot-orchestrator.ts'];

const cleanupProtectedEntrypoints = ['evals/retrieval-live/lib/snapshot-orchestrator.ts'];

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

  it('injects the knowledge-read graph owner into compatibility composition', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('createKnowledgeReadGraphIndexRepository');
    expect(source).toMatch(
      /const graphIndex\s*=\s*createKnowledgeReadGraphIndexRepository\(pool\)/,
    );
    expect(source).toMatch(/graphIndex,\s*graphQueryBackend/);
  });

  it('injects the owner graph-query port and host runtime state into compatibility composition', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('createMemoryGraphQueryBackend');
    expect(source).toMatch(
      /const graphQueryBackend\s*=\s*options\.graphQueryBackend\s*\?\?\s*createMemoryGraphQueryBackend\(graphIndex\)/,
    );
    expect(source).toMatch(/graphQueryBackend,\s*graphQuery,/);
    expect(source).toMatch(
      /const graphQuery\s*=\s*options\.graphQuery\s*\?\?\s*options\.graphQueryBackend\?\.getRuntimeState\(\)\s*\?\?\s*\{\s*backendKind:\s*'memory' as const,\s*failOpen:\s*true,\s*mode:\s*'disabled' as const,\s*\}/,
    );
  });

  it.each(entrypoints)('%s uses host PostgreSQL composition', async (entrypoint) => {
    const source = await readFile(path.resolve(entrypoint), 'utf8');

    expect(source).toContain('buildPostgresComposedServer');
    expect(source).not.toMatch(/\bbuildServer\s*\(/);
    expect(source).toContain('PostgreSQL host composition');
  });

  it('exports retrieval snapshots from owner projections without the compatibility server', async () => {
    const source = await readFile('scripts/export-retrieval-db-snapshot.ts', 'utf8');

    expect(source).toContain('createKnowledgeWriteOwnerBundle');
    expect(source).toContain('createKnowledgeReadGraphIndexRepository');
    expect(source).not.toContain('@trapmap/server');
  });

  it('round-trips skill bundles through knowledge-write owner ports without compatibility composition', async () => {
    const source = await readFile('scripts/test-skill-import-export.ts', 'utf8');

    expect(source).toContain('createArtifactBundleImportPort');
    expect(source).toContain('createArtifactReadProjection');
    expect(source).toContain('new Pool');
    expect(source).not.toContain('buildPostgresComposedServer');
    expect(source).not.toContain('app.inject');
  });

  it.each(cleanupProtectedEntrypoints)(
    '%s closes its host pool when readiness fails',
    async (entrypoint) => {
      const source = await readFile(path.resolve(entrypoint), 'utf8');

      expect(source).toMatch(/try\s*\{\s*await app\.ready\(\);/);
    },
  );
});
