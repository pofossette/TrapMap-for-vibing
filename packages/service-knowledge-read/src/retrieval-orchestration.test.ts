import type { RetrievalQuery } from '@trapmap/contracts';
import type { MergedCandidate, ScoredEntry } from '@trapmap/server/lib/retrieval/types.js';
import { describe, expect, it, vi } from 'vitest';

import {
  ChannelRegistry,
  type KnowledgeReadRecallChannel,
  type RetrievalStrategy,
  StrategyRegistry,
} from './retrieval-orchestration.js';
import type { KnowledgeRecord } from './store.js';

function makeMockChannel(name: string): KnowledgeReadRecallChannel {
  return {
    name,
    recall: vi.fn(async () => []),
  };
}

function makeMockStrategy(version: string): RetrievalStrategy {
  return {
    version,
    execute: vi.fn(
      async (): Promise<{
        scoredEntries: ScoredEntry[];
        mergedCandidates?: MergedCandidate[];
      }> => ({
        scoredEntries: [],
      }),
    ),
  };
}

describe('knowledge-read retrieval orchestration', () => {
  it('registers channels by name and preserves insertion order', () => {
    const registry = new ChannelRegistry();
    const semantic = makeMockChannel('semantic');
    const keyword = makeMockChannel('keyword');

    registry.register(semantic);
    registry.register(keyword);

    expect(registry.get('semantic')).toBe(semantic);
    expect(registry.all()).toEqual([semantic, keyword]);
  });

  it('rejects duplicate channel names', () => {
    const registry = new ChannelRegistry();
    registry.register(makeMockChannel('semantic'));

    expect(() => registry.register(makeMockChannel('semantic'))).toThrow(/already registered/);
  });

  it('stores retrieval strategies by version and allows overwrite', () => {
    const registry = new StrategyRegistry();
    const first = makeMockStrategy('hybrid');
    const second = makeMockStrategy('hybrid');

    registry.register(first);
    registry.register(second);

    expect(registry.get('hybrid')).toBe(second);
    expect(registry.all()).toEqual([second]);
  });
});
