import type { FreshnessDecayConfig } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildUnknownModeMessage,
  computeScore,
  cosineSimilarity,
  createGraphRecallTrace,
  createSemanticCandidate,
  DEFAULT_FRESHNESS_DECAY_CONFIG,
  GRAPH_SCORE_BOOST_FACTOR,
  inferChannelsFromMerged,
  MERGE_KEYWORD_WEIGHT,
  MERGE_SEMANTIC_WEIGHT,
  type MergedCandidateLike,
  mergeCandidates,
  mergeCandidatesWithGraph,
  RECALL_CHANNEL_GRAPH,
  RECALL_CHANNEL_KEYWORD,
  RECALL_CHANNEL_SEMANTIC,
  type RecallCandidateLike,
  rerankCandidates,
  routingDecision,
  versionMatchMultiplier,
} from '../../../src/knowledge-read/domain/index.js';

interface Entry {
  id: string;
  scope: string;
  labels: string[];
  shortcut: string;
  detail: string;
  decayMeta?: { decayState?: string } | null;
  boundary?: null;
}

function createEntry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    scope: 'global',
    labels: [],
    shortcut: '',
    detail: '',
    decayMeta: null,
    ...overrides,
  };
}

function createMerged(entry: Entry, combinedScore: number): MergedCandidateLike<Entry> {
  return {
    entry,
    semanticScore: 1,
    keywordScore: 0,
    graphScore: 0,
    channelScores: { semantic: 1 },
    combinedScore,
    tokenMatches: [],
    channels: [RECALL_CHANNEL_SEMANTIC],
    preRerankScore: combinedScore,
    finalScore: combinedScore,
  };
}

describe('knowledge-read ranking rules', () => {
  it('merges semantic and keyword candidates with fixed weights', () => {
    const semantic = [createSemanticCandidate(createEntry('a'), 0.8)];
    const keyword: RecallCandidateLike<Entry>[] = [
      {
        entry: createEntry('a'),
        channel: RECALL_CHANNEL_KEYWORD,
        score: 0.4,
        tokenMatches: [{ token: 'x', fields: ['shortcut'] }],
      },
      { entry: createEntry('b'), channel: RECALL_CHANNEL_KEYWORD, score: 0.5, tokenMatches: [] },
    ];
    const merged = mergeCandidates(semantic, keyword);

    expect(MERGE_SEMANTIC_WEIGHT).toBe(0.6);
    expect(MERGE_KEYWORD_WEIGHT).toBe(0.4);
    expect(merged).toHaveLength(2);
    const a = merged.find((c) => c.entry.id === 'a');
    expect(a?.combinedScore).toBeCloseTo(0.8 * 0.6 + 0.4 * 0.4);
    expect(a?.channels).toEqual([RECALL_CHANNEL_SEMANTIC, RECALL_CHANNEL_KEYWORD]);
    const b = merged.find((c) => c.entry.id === 'b');
    expect(b?.combinedScore).toBeCloseTo(0.5 * 0.4);
    expect(b?.channels).toEqual([RECALL_CHANNEL_KEYWORD]);
  });

  it('preserves stale-entry penalties while reranking', () => {
    const candidate = createMerged(createEntry('e', { decayMeta: { decayState: 'stale' } }), 0.6);
    candidate.channels = [RECALL_CHANNEL_SEMANTIC, RECALL_CHANNEL_KEYWORD];
    candidate.keywordScore = 0.6;
    candidate.tokenMatches = [{ token: 'entry', fields: ['shortcut'] }];

    const [reranked] = rerankCandidates([candidate], ['entry'], {
      maxCandidates: 1,
      freshnessConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
    });

    expect(reranked?.combinedScore).toBeCloseTo(0.75);
    expect(reranked?.preRerankScore).toBe(0.6);
    expect(reranked?.finalScore).toBeCloseTo(0.75);
  });

  it('applies early termination and max candidate limits', () => {
    const candidates = [createMerged(createEntry('a'), 0.8), createMerged(createEntry('b'), 0.4)];
    const reranked = rerankCandidates(candidates, [], {
      maxCandidates: 5,
      freshnessConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
      earlyTerminationThreshold: 0.6,
    });
    expect(reranked.map((c) => c.entry.id)).toEqual(['a']);

    const bothRetained = rerankCandidates(candidates, [], {
      maxCandidates: 1,
      freshnessConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
    });
    expect(bothRetained.map((c) => c.entry.id)).toEqual(['a']);
  });

  it('merges graph candidates into the hybrid result with a boost factor', () => {
    const entry = createEntry('a');
    const hybrid = [createMerged(entry, 0.5)];
    const graph: RecallCandidateLike<Entry>[] = [
      { entry, channel: RECALL_CHANNEL_GRAPH, score: 0.5, tokenMatches: [] },
      { entry: createEntry('c'), channel: RECALL_CHANNEL_GRAPH, score: 0.3, tokenMatches: [] },
    ];
    const merged = mergeCandidatesWithGraph(hybrid, graph);

    expect(GRAPH_SCORE_BOOST_FACTOR).toBe(0.2);
    expect(merged).toHaveLength(2);
    const a = merged.find((c) => c.entry.id === 'a');
    expect(a?.combinedScore).toBeCloseTo(0.5 + 0.5 * 0.2);
    expect(a?.channels).toContain(RECALL_CHANNEL_GRAPH);
    expect(merged[0]?.entry.id).toBe('a');
    expect(merged[1]?.entry.id).toBe('c');
  });

  it('infers routing channels from merged candidates', () => {
    expect(inferChannelsFromMerged(undefined)).toEqual([RECALL_CHANNEL_SEMANTIC]);
    expect(inferChannelsFromMerged([])).toEqual([RECALL_CHANNEL_SEMANTIC]);
    expect(
      inferChannelsFromMerged([
        { channels: [RECALL_CHANNEL_KEYWORD] },
        { channels: [RECALL_CHANNEL_GRAPH] },
      ]),
    ).toEqual([RECALL_CHANNEL_KEYWORD, RECALL_CHANNEL_GRAPH]);
  });

  it('maps explicit query modes to planned channels', () => {
    expect(routingDecision('semantic').channelsPlanned).toEqual([RECALL_CHANNEL_SEMANTIC]);
    expect(routingDecision('hybrid').channelsPlanned).toEqual([
      RECALL_CHANNEL_SEMANTIC,
      RECALL_CHANNEL_KEYWORD,
    ]);
    expect(routingDecision('graph-assisted').channelsPlanned).toEqual([
      RECALL_CHANNEL_SEMANTIC,
      RECALL_CHANNEL_KEYWORD,
      RECALL_CHANNEL_GRAPH,
    ]);
    expect(routingDecision('unknown').fallbackApplied).toBe(true);
    expect(routingDecision('unknown').selectedMode).toBe('local');
  });

  it('builds the unknown-mode validation message from the strategy whitelist', () => {
    expect(buildUnknownModeMessage('unknown-mode', ['semantic', 'hybrid'])).toBe(
      'Invalid query mode: unknown-mode. Must be one of: semantic, hybrid',
    );
  });

  it('computes semantic scores with label, scope and lexical boosts', () => {
    const entry = createEntry('e', {
      labels: ['deploy'],
      scope: 'project',
      shortcut: 'deploy k8s',
      detail: 'deploy k8s cluster',
    });
    const base = computeScore(0.5, entry, { scopes: [], labels: [] });
    expect(base).toBeCloseTo(0.5);
    const labeled = computeScore(0.5, entry, { scopes: [], labels: ['deploy'] });
    expect(labeled).toBeCloseTo(0.55);
    const scoped = computeScore(0.5, entry, { scopes: ['project'], labels: [] });
    expect(scoped).toBeCloseTo(0.53);
    const boosted = computeScore(0.5, entry, { scopes: [], labels: [] }, 'deploy k8s');
    expect(boosted).toBe(1);
  });

  it('computes cosine similarity and rejects mismatched dimensions', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow('Vector dimensions must match');
  });

  it('renders the graph recall trace from runtime state', () => {
    expect(createGraphRecallTrace(undefined, 3)).toEqual({
      mergeMode: 'mixed',
      graphExpansion: 'local-neighborhood',
      backendKind: 'memory',
      backendMode: 'disabled',
      graphCandidateCount: 3,
    });
    expect(createGraphRecallTrace({ backendKind: 'pg', mode: 'synced' }, 0).backendKind).toBe('pg');
  });

  describe('versionMatchMultiplier', () => {
    it('returns matchMultiplier when a versioned entry matches a query version', () => {
      expect(
        versionMatchMultiplier({
          artifactVersion: '2.2.0',
          queryVersions: [{ package: 'react', version: '2.2.0' }],
          freshnessType: 'versioned',
          decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
        }),
      ).toBe(DEFAULT_FRESHNESS_DECAY_CONFIG.versioned.matchMultiplier);
    });

    it('returns mismatchMultiplier when a versioned entry does not match any query version', () => {
      expect(
        versionMatchMultiplier({
          artifactVersion: '2.1.0',
          queryVersions: [{ package: 'react', version: '2.2.0' }],
          freshnessType: 'versioned',
          decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
        }),
      ).toBe(DEFAULT_FRESHNESS_DECAY_CONFIG.versioned.mismatchMultiplier);
    });

    it('treats an entry without a declared version as neutral (unknown is not a mismatch)', () => {
      expect(
        versionMatchMultiplier({
          artifactVersion: undefined,
          queryVersions: [{ package: 'react', version: '2.2.0' }],
          freshnessType: 'versioned',
          decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
        }),
      ).toBe(1);
      expect(
        versionMatchMultiplier({
          artifactVersion: null,
          queryVersions: [{ package: 'react', version: '2.2.0' }],
          freshnessType: 'versioned',
          decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
        }),
      ).toBe(1);
    });

    it('matches the first matching query version across packages', () => {
      expect(
        versionMatchMultiplier({
          artifactVersion: '18.0.0',
          queryVersions: [
            { package: 'node', version: '22.0.0' },
            { package: 'react', version: '18.0.0' },
          ],
          freshnessType: 'versioned',
          decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
        }),
      ).toBe(DEFAULT_FRESHNESS_DECAY_CONFIG.versioned.matchMultiplier);
    });

    it('returns 1 for non-versioned freshness types', () => {
      const input = {
        artifactVersion: '2.2.0',
        queryVersions: [{ package: 'react', version: '2.2.0' }],
        decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
      };
      expect(versionMatchMultiplier({ ...input, freshnessType: 'evergreen' })).toBe(1);
      expect(versionMatchMultiplier({ ...input, freshnessType: 'volatile' })).toBe(1);
      expect(versionMatchMultiplier({ ...input, freshnessType: null })).toBe(1);
      expect(versionMatchMultiplier({ ...input, freshnessType: undefined })).toBe(1);
    });

    it('returns 1 when the query has no version constraints', () => {
      const input = {
        artifactVersion: '2.2.0',
        freshnessType: 'versioned' as const,
        decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
      };
      expect(versionMatchMultiplier({ ...input, queryVersions: undefined })).toBe(1);
      expect(versionMatchMultiplier({ ...input, queryVersions: [] })).toBe(1);
      expect(versionMatchMultiplier({ ...input, queryVersions: null })).toBe(1);
    });

    it('returns 1 when the versioned decay config is disabled', () => {
      expect(
        versionMatchMultiplier({
          artifactVersion: '2.1.0',
          queryVersions: [{ package: 'react', version: '2.2.0' }],
          freshnessType: 'versioned',
          decayConfig: {
            ...DEFAULT_FRESHNESS_DECAY_CONFIG,
            versioned: { ...DEFAULT_FRESHNESS_DECAY_CONFIG.versioned, enabled: false },
          },
        }),
      ).toBe(1);
    });

    it('returns 1 when the versioned decay config is absent', () => {
      const config = { ...DEFAULT_FRESHNESS_DECAY_CONFIG };
      (config as Partial<FreshnessDecayConfig>).versioned = undefined;
      expect(
        versionMatchMultiplier({
          artifactVersion: '2.1.0',
          queryVersions: [{ package: 'react', version: '2.2.0' }],
          freshnessType: 'versioned',
          decayConfig: config,
        }),
      ).toBe(1);
    });
  });
});
