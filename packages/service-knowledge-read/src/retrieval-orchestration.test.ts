import { InvocationError } from '@trapmap/backend-core';
import { type RetrievalQuery, retrievalQuerySchema } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  ChannelRegistry,
  type KnowledgeReadRecallChannel,
  type RetrievalStrategy,
  StrategyRegistry,
} from './retrieval-orchestration.js';
import { dispatchByMode, semanticRecall } from './retrieval-recall-coordinator.js';
import { createDefaultKnowledgeReadRetrievalInfra } from './retrieval-infra-default.js';
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

function createEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'entry-1',
    shortcut: 'entry',
    detail: 'detail',
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

function revisionWithVersion(
  version: string,
): KnowledgeRecord['latestRevision'] & { version?: string } {
  return {
    revision: 1,
    submittedAt: '2026-01-01T00:00:00.000Z',
    submittedByUserId: 'user-1',
    shortcut: 'react refresh workaround',
    detail: 'react refresh workaround details',
    labels: [],
    reviewNotes: [],
    version,
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

  it('decays versioned entries and exposes version metadata through semantic recall', async () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const services = {
      retrievalInfra: infra,
      store: {},
    } as Parameters<typeof semanticRecall>[3];
    const seed = 'react refresh workaround';
    const entries = [
      createEntry({
        id: 'versioned-match',
        shortcut: seed,
        detail: seed,
        latestRevision: revisionWithVersion('18.2.0'),
        decayMeta: { freshnessType: 'versioned' } as KnowledgeRecord['decayMeta'],
      }),
      createEntry({
        id: 'versioned-mismatch',
        shortcut: seed,
        detail: seed,
        latestRevision: revisionWithVersion('17.0.0'),
        decayMeta: { freshnessType: 'versioned' } as KnowledgeRecord['decayMeta'],
      }),
    ];

    const { scoredEntries } = await semanticRecall(
      seed,
      entries,
      retrievalQuerySchema.parse({
        seed,
        mode: 'semantic',
        maxResults: 10,
        boundaryContext: { versions: [{ package: 'react', version: '18.2.0' }] },
      }),
      services,
    );

    const byId = new Map(scoredEntries.map((e) => [e.entry.id, e]));
    expect(byId.get('versioned-match')?.score).toBeCloseTo(1);
    expect(byId.get('versioned-mismatch')?.score).toBeCloseTo(0.5);
    expect(byId.get('versioned-match')?.version).toBe('18.2.0');
    expect(byId.get('versioned-match')?.revision).toBe(1);
    expect(byId.get('versioned-mismatch')?.version).toBe('17.0.0');
  });
});
