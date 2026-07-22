import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { resolvePostgresCoordinatorConfig } from '../run-postgres-coordinated.js';

describe('run-postgres-coordinated', () => {
  it('supports an explicitly configured PostgreSQL coordinator without weakening isolation', async () => {
    const source = await readFile(
      new URL('../run-postgres-coordinated.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('TRAPMAP_POSTGRES_COORDINATOR_URL');
    expect(source).toContain('resolvePostgresCoordinatorConfig');
    expect(source).toContain('CREATE DATABASE');
    expect(source).toContain('DROP DATABASE IF EXISTS');
    expect(source).toContain("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    expect(source).toContain('isDirectExecution');
  });

  it('uses an explicit PostgreSQL admin database as the external coordinator', () => {
    expect(
      resolvePostgresCoordinatorConfig({
        TRAPMAP_POSTGRES_COORDINATOR_URL:
          'postgresql://trapmap:test@localhost:5432/postgres?sslmode=disable',
      }),
    ).toEqual({
      adminUrl: 'postgresql://trapmap:test@localhost:5432/postgres?sslmode=disable',
    });
  });

  it('keeps Docker as the default coordinator', () => {
    expect(resolvePostgresCoordinatorConfig({})).toBeUndefined();
  });

  it.each(['https://example.com/postgres', 'postgresql://trapmap:test@localhost:5432/'])(
    'rejects an invalid external coordinator URL: %s',
    (databaseUrl) => {
      expect(() => {
        resolvePostgresCoordinatorConfig({ TRAPMAP_POSTGRES_COORDINATOR_URL: databaseUrl });
      }).toThrow('TRAPMAP_POSTGRES_COORDINATOR_URL');
    },
  );
});
