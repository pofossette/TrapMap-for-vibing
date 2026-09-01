import { retrievalQuerySchema } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultKnowledgeReadRetrievalInfra } from '../../src/retrieval-infra-default.js';
import { graphAssistedHybridRecall } from '../../src/retrieval-recall-coordinator.js';
import type { KnowledgeRecord } from '../../src/store.js';

function createEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'entry-1',
    shortcut: 'react refresh workaround',
    detail: 'react refresh workaround details',
    labels: [],
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    decayMeta: null,
    history: [],
    ...overrides,
  } as KnowledgeRecord;
}

describe('channel-merge D8 call-site migration', () => {
  it('routes graph-channel fusion through the injected channelMerge port', async () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const merge = vi.fn(
      async (input: { hybridCandidates: unknown[]; graphCandidates: unknown[] }) =>
        input.hybridCandidates,
    );
    const services = {
      retrievalInfra: infra,
      graphQuery: { backendKind: 'memory', failOpen: true, mode: 'disabled' },
      channelMerge: { merge },
    } as Parameters<typeof graphAssistedHybridRecall>[3];

    const parsed = retrievalQuerySchema.parse({
      seed: 'react refresh workaround',
      mode: 'graph-assisted',
      maxResults: 10,
    });
    const result = await graphAssistedHybridRecall(
      'react refresh workaround',
      [createEntry()],
      parsed,
      services,
    );

    // The port decides the graph fusion; the rule default merges with
    // mergeCandidatesWithGraph, so the pipeline result is unchanged.
    expect(merge).toHaveBeenCalledTimes(1);
    const input = merge.mock.calls[0]![0] as {
      hybridCandidates: Array<{ entry: { id: string } }>;
      graphCandidates: unknown[];
    };
    expect(input.hybridCandidates.length).toBe(1);
    expect(input.graphCandidates).toEqual([]);
    expect(result.scoredEntries[0]?.entry.id).toBe('entry-1');
  });
});
