import { InvocationError } from '@trapmap/backend-core';
import type { RetrievalQuery, retrievalQuerySchema } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  ChannelRegistry,
  type KnowledgeReadRecallChannel,
  type RetrievalStrategy,
  StrategyRegistry,
} from './retrieval-orchestration.js';
import { dispatchByMode } from './retrieval-recall-coordinator.js';
import type { MergedCandidate, ScoredEntry } from './retrieval-types.js';
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

  it('raises a validation invocation error when the requested mode is unknown', async () => {
    const strategyRegistry = new StrategyRegistry();
    const channelRegistry = new ChannelRegistry();

    await expect(
      dispatchByMode(
        'unknown-mode',
        'seed',
        [] satisfies KnowledgeRecord[],
        {
          seed: 'seed',
          mode: 'semantic',
          maxResults: 5,
        } as ReturnType<typeof retrievalQuerySchema.parse>,
        strategyRegistry,
        channelRegistry,
      ),
    ).rejects.toMatchObject({
      name: 'InvocationError',
      kind: 'validation',
      message: expect.stringContaining('Invalid query mode: unknown-mode'),
    });
    await expect(
      dispatchByMode(
        'unknown-mode',
        'seed',
        [] satisfies KnowledgeRecord[],
        {
          seed: 'seed',
          mode: 'semantic',
          maxResults: 5,
        } as ReturnType<typeof retrievalQuerySchema.parse>,
        strategyRegistry,
        channelRegistry,
      ),
    ).rejects.toBeInstanceOf(InvocationError);
  });
});
