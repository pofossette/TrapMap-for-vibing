import { describe, expect, it, vi } from 'vitest';

import type { GraphIndexRepositoryPort } from '@trapmap/contracts';
import type { Pool } from 'pg';

import { loadRawLabelSources, runLabelBackfill, runLabelRunnerMain } from '../label-runner.js';

describe('loadRawLabelSources', () => {
  it('loads historical labels from knowledge, artifacts, and owner graph docs', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ entry_id: 'k1', label: 'timeout-issue' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'artifact_1', labels: ['docker', 'cache'] }] }),
    } as unknown as Pool;
    const graphIndex: Pick<GraphIndexRepositoryPort, 'listAll'> = {
      listAll: vi.fn().mockResolvedValue([
        {
          id: 'graphdoc_trap_k1_r1',
          sourceType: 'trap',
          sourceId: 'k1',
          revision: 1,
          contentHash: 'hash',
          teamId: null,
          scope: 'global',
          requiredLevel: 0,
          nodes: [
            {
              id: 'cue:lbl_timeout',
              kind: 'cue',
              label: 'timeout-issue',
              rawLabel: 'pod-timeout',
              evidence: 'test',
              canonicalLabelId: 'lbl_timeout',
              alignmentDecision: 'existing',
            },
            { id: 'trap:k1', kind: 'trap', label: 'Trap', evidence: 'test' },
          ],
          edges: [],
          evidence: 'test',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
    };

    await expect(loadRawLabelSources(pool, graphIndex)).resolves.toEqual([
      { label: 'timeout-issue', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' },
      { label: 'docker', kind: 'tool', sourceType: 'artifact', sourceId: 'artifact_1' },
      { label: 'cache', kind: 'tool', sourceType: 'artifact', sourceId: 'artifact_1' },
      { label: 'pod-timeout', kind: 'cue', sourceType: 'graph', sourceId: 'graphdoc_trap_k1_r1' },
    ]);
  });
});

describe('label runner execution', () => {
  it('rejects the backfill before creating a pool when DATABASE_URL is absent', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    await expect(runLabelBackfill(true)).rejects.toThrow(
      'DATABASE_URL environment variable is required',
    );

    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it('marks an asynchronously failed entrypoint as unsuccessful', async () => {
    const previousExitCode = process.exitCode;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const completion = runLabelRunnerMain(async () => {
      throw new Error('expected failure');
    }, 'Backfill');

    expect(completion).toBeInstanceOf(Promise);
    await completion;

    expect(error).toHaveBeenCalledWith('Backfill failed:', expect.any(Error));
    expect(process.exitCode).toBe(1);

    process.exitCode = previousExitCode;
    error.mockRestore();
  });
});
