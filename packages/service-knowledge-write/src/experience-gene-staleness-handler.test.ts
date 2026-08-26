import { describe, expect, it, vi } from 'vitest';

import { createExperienceGeneFixture } from '@trapmap/backend-core/testing/index.js';
import { sha256CanonicalJson } from '@trapmap/lib';
import { createExperienceGeneStaleHandler } from './experience-gene-staleness-handler.js';
import { createExperienceGeneQueryPool } from './testing/experience-gene-query-pool.js';

const trapRow = {
  id: 'trap-1',
  shortcut: 'Queue retries',
  detail: 'Claim a lease before publishing.',
  labels: ['queue'],
  scope: 'project',
  team_id: null,
  required_level: 2,
  revision_no: 3,
  source_hash: sha256CanonicalJson({
    title: 'Queue retries',
    text: 'Claim a lease before publishing.',
    labels: ['queue'],
  }),
  lifecycle_state: 'approved',
  suppressed_from_retrieval: false,
  suppressed_from_index: false,
};

function trapGene() {
  const gene = createExperienceGeneFixture();
  return {
    ...gene,
    source: { ...gene.source, sourceHash: trapRow.source_hash },
  };
}

describe('experience gene stale handlers', () => {
  it('marks trap genes stale when the lifecycle payload is rejected', async () => {
    const { pool } = createExperienceGeneQueryPool([
      { match: /FROM knowledge_entries/, rows: [trapRow] },
    ]);
    const repository = {
      listActiveBySource: vi.fn(async () => [trapGene()]),
      markStaleForSource: vi.fn(async () => 1),
    };
    const onStale = vi.fn();
    const handler = createExperienceGeneStaleHandler({ pool, repository, onStale });
    const marked = await handler.handle({
      name: 'knowledge.rejected',
      entryId: 'trap-1',
      previousState: 'approved',
      nextState: 'rejected',
      timestamp: '2026-08-26T00:00:00.000Z',
    });

    expect(marked).toBe(1);
    expect(onStale).toHaveBeenCalledWith('source-lifecycle', 1);
    expect(repository.markStaleForSource).toHaveBeenCalledWith(
      { kind: 'trap', sourceId: 'trap-1' },
      'source-lifecycle',
    );
  });

  it('keeps fresh governed trap genes active after approval', async () => {
    const { pool } = createExperienceGeneQueryPool([
      { match: /FROM knowledge_entries/, rows: [trapRow] },
    ]);
    const repository = {
      listActiveBySource: vi.fn(async () => [trapGene()]),
      markStaleForSource: vi.fn(),
    };

    await expect(
      createExperienceGeneStaleHandler({ pool, repository }).handle({
        name: 'knowledge.approved',
        entryId: 'trap-1',
        previousState: 'agent-pass',
        nextState: 'approved',
        timestamp: '2026-08-26T00:00:00.000Z',
      }),
    ).resolves.toBe(0);
    expect(repository.markStaleForSource).not.toHaveBeenCalled();
  });

  it('accepts an explicit remediation signal without guessing its shape', async () => {
    const { pool } = createExperienceGeneQueryPool([
      { match: /FROM knowledge_entries/, rows: [{ ...trapRow, suppressed_from_retrieval: true }] },
    ]);
    const repository = {
      listActiveBySource: vi.fn(async () => [trapGene()]),
      markStaleForSource: vi.fn(async () => 1),
    };

    await expect(
      createExperienceGeneStaleHandler({ pool, repository }).handle({
        name: 'knowledge.remediation',
        entryId: 'trap-1',
        suppressedFromRetrieval: true,
        timestamp: '2026-08-26T00:00:00.000Z',
      }),
    ).resolves.toBe(1);
    expect(repository.markStaleForSource).toHaveBeenCalledWith(
      { kind: 'trap', sourceId: 'trap-1' },
      'remediation',
    );
  });

  it('rejects unknown payloads before reading or mutating projections', async () => {
    const { pool, queries } = createExperienceGeneQueryPool();
    const repository = {
      listActiveBySource: vi.fn(),
      markStaleForSource: vi.fn(),
    };

    await expect(
      createExperienceGeneStaleHandler({ pool, repository }).handle({ name: 'unknown' }),
    ).rejects.toThrow('unknown experience gene staleness payload');
    expect(queries).toEqual([]);
    expect(repository.listActiveBySource).not.toHaveBeenCalled();
  });
});
