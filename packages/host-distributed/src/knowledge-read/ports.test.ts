/**
 * knowledge-read host ports: read-model projection + ILIKE retrieval.
 *
 * These migrated verbatim from the retired `shared/ports.ts` simplified
 * bundle, so behaviour (including the ILIKE retrieval seam) is unchanged.
 */
import { describe, expect, it } from 'vitest';

import { createPgKnowledgeReadProjection, createPgRetrievalQuery } from './ports.js';

const ROW = {
  id: 'entry-1',
  detail: 'TrapMap assembly pilot',
  shortcut: 'pilot',
  labels: ['assembly'],
  owner_user_id: 'user-1',
  team_id: 'team-1',
  lifecycle_state: 'approved',
  created_at: '2026-08-16T00:00:00Z',
};

function pool(rows: unknown[]) {
  return { query: async () => ({ rows }) };
}

describe('createPgKnowledgeReadProjection', () => {
  it('maps a raw row into a KnowledgeEntryRecord', async () => {
    const projection = createPgKnowledgeReadProjection(pool([ROW]));
    const entry = await projection.getById('entry-1');
    expect(entry).toMatchObject({
      id: 'entry-1',
      content: 'TrapMap assembly pilot',
      title: 'pilot',
      labels: ['assembly'],
      ownerUserId: 'user-1',
      teamId: 'team-1',
      lifecycleState: 'approved',
    });
  });

  it('returns null for a missing row', async () => {
    const projection = createPgKnowledgeReadProjection(pool([]));
    await expect(projection.getById('missing')).resolves.toBeNull();
  });
});

describe('createPgRetrievalQuery', () => {
  it('builds ILIKE search results with a deterministic snippet', async () => {
    const retrieval = createPgRetrievalQuery(
      pool([{ id: 'entry-1', content: 'TrapMap assembly pilot', title: 'pilot' }]),
    );
    const result = await retrieval.search({ query: 'pilot' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.entryId).toBe('entry-1');
    expect(result.results[0]?.score).toBe(1.0);
  });
});
