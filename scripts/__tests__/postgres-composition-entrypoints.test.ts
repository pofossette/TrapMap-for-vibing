import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const entrypoints = ['evals/retrieval-live/lib/snapshot-orchestrator.ts'];

describe('PostgreSQL composition entrypoints', () => {
  it('uses host-local runtime composition with Fastify', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('createHostLocalRuntime');
    expect(source).toContain('Fastify');
    expect(source).toContain('PostgresComposedServer');
    expect(source).not.toContain('buildServer');
    expect(source).not.toContain('@trapmap/server');
  });

  it('returns Fastify app with runtime and services', async () => {
    const source = await readFile('scripts/testing/postgres-server-composition.ts', 'utf8');

    expect(source).toContain('PostgresComposedServer');
    expect(source).toContain('Fastify');
    expect(source).toContain('runtime');
    expect(source).toContain('services');
  });

  it.each(entrypoints)('%s uses host PostgreSQL composition', async (entrypoint) => {
    const source = await readFile(path.resolve(entrypoint), 'utf8');

    expect(source).toContain('buildPostgresComposedServer');
    expect(source).not.toMatch(/\bbuildServer\s*\(/);
    expect(source).toContain('PostgreSQL host composition');
  });

  it('exports retrieval snapshots from owner projections without the compatibility server', async () => {
    const source = await readFile('scripts/archived/export-retrieval-db-snapshot.ts', 'utf8');

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
});
