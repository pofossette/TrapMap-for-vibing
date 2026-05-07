import type { RetrievalQuery } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeRecord } from '../store.js';
import type { ChannelRegistry } from './channel-registry.js';
import { type RetrievalStrategy, StrategyRegistry } from './strategy-registry.js';
import type { MergedCandidate, ScoredEntry } from './types.js';

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

describe('StrategyRegistry', () => {
  it('register and get by version', () => {
    const registry = new StrategyRegistry();
    const strategy = makeMockStrategy('v1');
    registry.register(strategy);
    expect(registry.get('v1')).toBe(strategy);
  });

  it('get returns undefined for unregistered version', () => {
    const registry = new StrategyRegistry();
    expect(registry.get('v99')).toBeUndefined();
  });

  it('all() returns all registered strategies', () => {
    const registry = new StrategyRegistry();
    const v1 = makeMockStrategy('v1');
    const v2 = makeMockStrategy('v2');
    registry.register(v1);
    registry.register(v2);
    expect(registry.all()).toEqual([v1, v2]);
  });

  it('register overwrites previous strategy with same version', () => {
    const registry = new StrategyRegistry();
    const first = makeMockStrategy('v1');
    const second = makeMockStrategy('v1');
    registry.register(first);
    registry.register(second);
    expect(registry.get('v1')).toBe(second);
    expect(registry.all()).toHaveLength(1);
  });
});
