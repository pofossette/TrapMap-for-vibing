import { describe, expect, it, vi } from 'vitest';

import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import type { Pool } from 'pg';

import { loadRawLabelSources } from './backfill-runner.js';

describe('loadRawLabelSources', () => {
  it('loads historical labels from knowledge, artifacts, and graph docs', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ entry_id: 'k1', label: 'timeout-issue' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'artifact_1', labels: ['docker', 'cache'] }],
        }),
    } as unknown as Pool;

    const graphRepo: Pick<GraphIndexRepository, 'listAll'> = {
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
            {
              id: 'trap:k1',
              kind: 'trap',
              label: 'Trap',
              evidence: 'test',
            },
          ],
          edges: [],
          evidence: 'test',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
    };

    const sources = await loadRawLabelSources(pool, graphRepo as GraphIndexRepository);

    expect(sources).toEqual([
      {
        label: 'timeout-issue',
        kind: 'cue',
        sourceType: 'knowledge',
        sourceId: 'k1',
      },
      {
        label: 'docker',
        kind: 'tool',
        sourceType: 'artifact',
        sourceId: 'artifact_1',
      },
      {
        label: 'cache',
        kind: 'tool',
        sourceType: 'artifact',
        sourceId: 'artifact_1',
      },
      {
        label: 'pod-timeout',
        kind: 'cue',
        sourceType: 'graph',
        sourceId: 'graphdoc_trap_k1_r1',
      },
    ]);
  });
});
