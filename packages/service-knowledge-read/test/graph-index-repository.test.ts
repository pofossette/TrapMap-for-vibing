import { describe, expect, it, vi } from 'vitest';

import type { GraphIndexDocumentRecord } from '@trapmap/contracts';

import { createKnowledgeReadGraphIndexRepository } from '../src/graph-index-repository.js';

const document: GraphIndexDocumentRecord = {
  id: 'graphdoc_trap_1_r1',
  sourceType: 'trap',
  sourceId: 'entry-1',
  revision: 1,
  contentHash: 'hash',
  teamId: null,
  scope: 'global',
  requiredLevel: 2,
  nodes: [{ id: 'trap:entry-1', kind: 'trap', label: 'Retry', evidence: 'source' }],
  edges: [],
  evidence: 'derived',
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
};

describe('createKnowledgeReadGraphIndexRepository', () => {
  it('persists graph documents through the knowledge-read owner port', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = createKnowledgeReadGraphIndexRepository({ query });

    await repository.upsert(document);
    await repository.removeBySource('trap', 'entry-1');

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain('INSERT INTO graph_index_documents');
    expect(query.mock.calls[0]?.[1]).toEqual([
      document.id,
      document.sourceType,
      document.sourceId,
      document.revision,
      document.contentHash,
      document.teamId,
      document.scope,
      document.requiredLevel,
      JSON.stringify(document.nodes),
      JSON.stringify(document.edges),
      document.evidence,
      document.createdAt,
      document.updatedAt,
    ]);
    expect(String(query.mock.calls[1]?.[0])).toContain('DELETE FROM graph_index_documents');
    expect(query.mock.calls[1]?.[1]).toEqual(['trap', 'entry-1']);
  });
});
