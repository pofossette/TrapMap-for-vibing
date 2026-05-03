import { describe, it, expect } from 'vitest';

import {
  rerankCandidates,
  DEFAULT_BOTH_CHANNEL_BOOST,
  DEFAULT_TOKEN_DENSITY_BOOST,
  DEFAULT_STALE_DECAY_PENALTY,
} from './rerank.js';
import { DEFAULT_FRESHNESS_CONFIG } from '../decay/freshness.js';
import type { MergedCandidate } from './types.js';
import type { DecayMeta, KnowledgeRecord } from '@trapmap/contracts';

/**
 * Helper to create mock candidate with decayMeta.
 */
function makeCandidate(
  id: string,
  score: number,
  decayMeta?: DecayMeta | null,
): MergedCandidate {
  return {
    entry: {
      id,
      scope: 'global',
      shortcut: `test-${id}`,
      detail: `Test entry ${id}`,
      labels: ['test'],
      requiredLevel: 'user',
      decayMeta: decayMeta ?? null,
    } as KnowledgeRecord,
    semanticScore: score,
    keywordScore: 0,
    combinedScore: score,
    tokenMatches: [],
    channels: ['semantic'],
    preRerankScore: score,
    finalScore: score,
  };
}

describe('rerankCandidates', () => {
  describe('basic reranking', () => {
    it('preserves candidate order when no boosts or penalties apply', () => {
      const candidates = [
        makeCandidate('entry-1', 0.9),
        makeCandidate('entry-2', 0.8),
        makeCandidate('entry-3', 0.7),
      ];

      const result = rerankCandidates(candidates, []);

      expect(result[0].entry.id).toBe('entry-1');
      expect(result[1].entry.id).toBe('entry-2');
      expect(result[2].entry.id).toBe('entry-3');
    });

    it('applies both-channel boost', () => {
      const candidates = [
        {
          ...makeCandidate('both-channels', 0.8),
          channels: ['semantic', 'keyword'],
        },
        makeCandidate('single-channel', 0.8),
      ];

      const result = rerankCandidates(candidates, []);

      expect(result[0].entry.id).toBe('both-channels');
      expect(result[0].combinedScore).toBe(0.8 + DEFAULT_BOTH_CHANNEL_BOOST);
    });

    it('applies token density boost when >= 50% tokens match', () => {
      const candidates = [
        {
          ...makeCandidate('high-density', 0.8),
          tokenMatches: [
            { token: 'test', fields: ['detail'] },
            { token: 'unit', fields: ['detail'] },
          ],
        },
        makeCandidate('low-density', 0.8),
      ];

      const result = rerankCandidates(candidates, ['test', 'unit', 'other']);

      expect(result[0].entry.id).toBe('high-density');
      expect(result[0].combinedScore).toBe(0.8 + DEFAULT_TOKEN_DENSITY_BOOST);
    });

    it('applies stale penalty', () => {
      const staleMeta: DecayMeta = {
        lastVerifiedAt: '2025-11-02T00:00:00Z',
        decayState: 'stale',
        supersededById: null,
        decayStateComputedAt: '2026-05-02T00:00:00Z',
        freshnessType: 'evergreen',
      };

      const candidates = [
        makeCandidate('stale-entry', 0.8, staleMeta),
        makeCandidate('fresh-entry', 0.8),
      ];

      const result = rerankCandidates(candidates, []);

      expect(result[0].entry.id).toBe('fresh-entry');
      expect(result[1].combinedScore).toBe(0.8 - DEFAULT_STALE_DECAY_PENALTY);
    });
  });

  describe('deterministic ordering', () => {
    it('sorts by score descending', () => {
      const candidates = [
        makeCandidate('low', 0.5),
        makeCandidate('high', 0.9),
        makeCandidate('medium', 0.7),
      ];

      const result = rerankCandidates(candidates, []);

      expect(result.map((c) => c.entry.id)).toEqual(['high', 'medium', 'low']);
    });

    it('uses entry ID as tiebreaker for equal scores', () => {
      const candidates = [
        makeCandidate('charlie', 0.8),
        makeCandidate('alpha', 0.8),
        makeCandidate('bravo', 0.8),
      ];

      const result = rerankCandidates(candidates, []);

      expect(result.map((c) => c.entry.id)).toEqual(['alpha', 'bravo', 'charlie']);
    });
  });

  describe('maxCandidates limit', () => {
    it('limits results when maxCandidates is set', () => {
      const candidates = [
        makeCandidate('entry-1', 0.9),
        makeCandidate('entry-2', 0.8),
        makeCandidate('entry-3', 0.7),
      ];

      const result = rerankCandidates(candidates, [], { maxCandidates: 2 });

      expect(result).toHaveLength(2);
      expect(result[0].entry.id).toBe('entry-1');
      expect(result[1].entry.id).toBe('entry-2');
    });
  });
});

describe('rerankCandidates with freshness decay', () => {
  // Helper to create mock candidate with decayMeta
  function makeCandidate(
    id: string,
    score: number,
    decayMeta?: DecayMeta | null,
  ): MergedCandidate {
    return {
      entry: {
        id,
        scope: 'global',
        shortcut: `test-${id}`,
        detail: `Test entry ${id}`,
        labels: ['test'],
        requiredLevel: 'user',
        decayMeta: decayMeta ?? null,
      } as KnowledgeRecord,
      semanticScore: score,
      keywordScore: 0,
      combinedScore: score,
      tokenMatches: [],
      channels: ['semantic'],
      preRerankScore: score,
      finalScore: score,
    };
  }

  it('applies freshness multiplier to volatile entries', () => {
    const volatileMeta: DecayMeta = {
      lastVerifiedAt: '2026-04-02T00:00:00Z', // 30 days ago
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };

    const evergreenMeta: DecayMeta = {
      lastVerifiedAt: '2025-05-02T00:00:00Z', // 1 year ago
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'evergreen',
    };

    const candidates = [
      makeCandidate('volatile-entry', 0.8, volatileMeta),
      makeCandidate('evergreen-entry', 0.8, evergreenMeta),
    ];

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    });

    // Volatile entry should score lower than evergreen
    const volatileResult = result.find((c) => c.entry.id === 'volatile-entry');
    const evergreenResult = result.find((c) => c.entry.id === 'evergreen-entry');

    expect(evergreenResult!.combinedScore).toBeGreaterThan(volatileResult!.combinedScore);
    expect(volatileResult!.decayMultiplier).toBeDefined();
    expect(volatileResult!.decayMultiplier).toBeLessThan(1.0);
  });

  it('compounds freshness decay with stale penalty', () => {
    const staleVolatileMeta: DecayMeta = {
      lastVerifiedAt: '2025-11-02T00:00:00Z', // 6 months ago
      decayState: 'stale',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };

    const candidates = [makeCandidate('stale-volatile', 0.8, staleVolatileMeta)];

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
      staleDecayPenalty: 0.1,
    });

    // Should have both stale penalty (-0.1) and freshness multiplier
    const entry = result[0];
    expect(entry.combinedScore).toBeLessThan(0.7); // 0.8 - 0.1 = 0.7, then multiplied
    expect(entry.decayMultiplier).toBeDefined();
  });

  it('no decay when freshness config has all types disabled', () => {
    const volatileMeta: DecayMeta = {
      lastVerifiedAt: '2026-04-02T00:00:00Z',
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };

    const candidates = [makeCandidate('volatile-entry', 0.8, volatileMeta)];

    const disabledConfig = {
      evergreen: { enabled: false },
      versioned: { enabled: false, mode: 'step' as const, matchMultiplier: 1.0, mismatchMultiplier: 0.5 },
      volatile: { enabled: false, mode: 'exponential' as const, halfLifeDays: 30, zeroDays: 90, floor: 0.3 },
    };

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: disabledConfig,
    });

    // No decay multiplier applied
    expect(result[0].decayMultiplier).toBeUndefined();
  });

  it('preserves preRerankScore for audit trail', () => {
    const volatileMeta: DecayMeta = {
      lastVerifiedAt: '2026-04-02T00:00:00Z',
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };

    const candidates = [makeCandidate('volatile-entry', 0.8, volatileMeta)];

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    });

    // preRerankScore preserved, combinedScore modified
    expect(result[0].preRerankScore).toBe(0.8);
    expect(result[0].combinedScore).toBeLessThan(0.8);
  });
});

// =============================================================================
// BOUND-04: Boundary-aware reranking tests (G7)
// =============================================================================

describe('rerankCandidates with boundary context', () => {
  function makeCandidateWithBoundary(
    id: string,
    score: number,
    boundary?: {
      context?: string[];
      exclusions?: { description: string; kind: string }[];
    },
  ): MergedCandidate {
    return {
      entry: {
        id,
        scope: 'global',
        shortcut: `test-${id}`,
        detail: `Test entry ${id}`,
        labels: ['test'],
        requiredLevel: 'user',
        decayMeta: null,
        boundary: boundary
          ? {
              context: boundary.context ?? [],
              versions: [],
              prerequisites: [],
              signals: [],
              exclusions: boundary.exclusions ?? [],
              evidence: [],
            }
          : undefined,
      } as unknown as KnowledgeRecord,
      semanticScore: score,
      keywordScore: 0,
      combinedScore: score,
      tokenMatches: [],
      channels: ['semantic'],
      preRerankScore: score,
      finalScore: score,
    };
  }

  it('applies preferred context boost when boundary context matches entry context', () => {
    const candidates = [
      makeCandidateWithBoundary('frontend-entry', 0.8, {
        context: ['frontend'],
      }),
      makeCandidateWithBoundary('backend-entry', 0.8, {
        context: ['backend'],
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['frontend'] },
    });

    // Frontend entry should rank higher due to context boost
    expect(result[0].entry.id).toBe('frontend-entry');
    expect(result[0].combinedScore).toBeGreaterThan(result[1].combinedScore);
  });

  it('applies exclusion penalty when boundary context matches exclusion', () => {
    const candidates = [
      makeCandidateWithBoundary('excluded-entry', 0.8, {
        exclusions: [{ description: 'Not for SSR environments', kind: 'context' }],
      }),
      makeCandidateWithBoundary('neutral-entry', 0.8),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['ssr'] },
    });

    // Neutral entry should rank higher since excluded entry gets penalty
    expect(result[0].entry.id).toBe('neutral-entry');
    expect(result[0].combinedScore).toBeGreaterThan(result[1].combinedScore);
  });

  it('records boundaryScoreDelta on candidates', () => {
    const candidates = [
      makeCandidateWithBoundary('boosted-entry', 0.8, {
        context: ['frontend'],
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['frontend'] },
    });

    expect(result[0].boundaryScoreDelta).toBeDefined();
    expect(result[0].boundaryScoreDelta).toBeGreaterThan(0);
  });

  it('clamps final score to 0-1 range after boundary adjustments', () => {
    // High base score + boundary boost should not exceed 1.0
    const candidates = [
      makeCandidateWithBoundary('high-score', 0.95, {
        context: ['frontend'],
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['frontend'] },
    });

    expect(result[0].combinedScore).toBeLessThanOrEqual(1.0);
  });

  it('no boundary effect when boundaryContext is undefined', () => {
    const candidates = [
      makeCandidateWithBoundary('entry-1', 0.8, { context: ['frontend'] }),
      makeCandidateWithBoundary('entry-2', 0.8),
    ];

    const result = rerankCandidates(candidates, []);

    // Both should have equal scores (no boundary adjustment)
    expect(result[0].combinedScore).toBe(result[1].combinedScore);
    expect(result[0].boundaryScoreDelta).toBeUndefined();
  });

  it('applies platform exclusion penalty', () => {
    const candidates = [
      makeCandidateWithBoundary('windows-excluded', 0.8, {
        exclusions: [{ description: 'Windows not supported', kind: 'platform' }],
      }),
      makeCandidateWithBoundary('no-exclusion', 0.8),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { platform: 'windows' },
    });

    expect(result[0].entry.id).toBe('no-exclusion');
    expect(result[1].entry.id).toBe('windows-excluded');
  });

  it('builds and attaches boundaryExplanation when boundaryContext is provided (BOUND-05)', () => {
    const candidates = [
      makeCandidateWithBoundary('frontend-entry', 0.8, {
        context: ['frontend'],
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['frontend'] },
    });

    expect(result[0].boundaryExplanation).toBeDefined();
    expect(result[0].boundaryExplanation?.checked).toBe(true);
    expect(result[0].boundaryExplanation?.boosts).toHaveLength(1);
    expect(result[0].boundaryExplanation?.boosts[0]).toContain('frontend');
  });

  it('builds boundaryExplanation with warnings for exclusion matches (BOUND-05)', () => {
    const candidates = [
      makeCandidateWithBoundary('excluded-entry', 0.8, {
        exclusions: [{ description: 'Not for SSR environments', kind: 'context' }],
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['ssr'] },
    });

    expect(result[0].boundaryExplanation).toBeDefined();
    expect(result[0].boundaryExplanation?.checked).toBe(true);
    expect(result[0].boundaryExplanation?.warnings).toHaveLength(1);
    expect(result[0].boundaryExplanation?.warnings[0]).toContain('SSR');
  });

  it('does not build boundaryExplanation when boundaryContext is undefined', () => {
    const candidates = [
      makeCandidateWithBoundary('entry-1', 0.8, { context: ['frontend'] }),
    ];

    const result = rerankCandidates(candidates, []);

    expect(result[0].boundaryExplanation).toBeUndefined();
  });

  it('skips boundaryExplanation when boundary delta is zero (optimization)', () => {
    // Entry without boundary context - delta will be 0
    const candidates = [
      makeCandidateWithBoundary('no-boundary', 0.8),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['frontend'] },
    });

    // boundaryScoreDelta should be 0, and boundaryExplanation should be skipped
    expect(result[0].boundaryScoreDelta).toBe(0);
    expect(result[0].boundaryExplanation).toBeUndefined();
  });
});

// =============================================================================
// 72-03: Performance optimization tests
// =============================================================================

describe('rerankCandidates with early termination', () => {
  function makeCandidate(
    id: string,
    score: number,
  ): MergedCandidate {
    return {
      entry: {
        id,
        scope: 'global',
        shortcut: `test-${id}`,
        detail: `Test entry ${id}`,
        labels: ['test'],
        requiredLevel: 'user',
        decayMeta: null,
      } as KnowledgeRecord,
      semanticScore: score,
      keywordScore: 0,
      combinedScore: score,
      tokenMatches: [],
      channels: ['semantic'],
      preRerankScore: score,
      finalScore: score,
    };
  }

  it('filters candidates below early termination threshold', () => {
    const candidates = [
      makeCandidate('high', 0.9),
      makeCandidate('medium', 0.5),
      makeCandidate('low', 0.2),
    ];

    const result = rerankCandidates(candidates, [], {
      earlyTerminationThreshold: 0.4,
    });

    // Only candidates with combinedScore >= 0.4 should be included
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.entry.id)).toEqual(['high', 'medium']);
  });

  it('includes all candidates when threshold is 0', () => {
    const candidates = [
      makeCandidate('high', 0.9),
      makeCandidate('low', 0.1),
    ];

    const result = rerankCandidates(candidates, [], {
      earlyTerminationThreshold: 0,
    });

    expect(result).toHaveLength(2);
  });

  it('returns empty array when all candidates are below threshold', () => {
    const candidates = [
      makeCandidate('low-1', 0.2),
      makeCandidate('low-2', 0.3),
    ];

    const result = rerankCandidates(candidates, [], {
      earlyTerminationThreshold: 0.5,
    });

    expect(result).toHaveLength(0);
  });

  it('no filtering when earlyTerminationThreshold is undefined', () => {
    const candidates = [
      makeCandidate('high', 0.9),
      makeCandidate('low', 0.1),
    ];

    const result = rerankCandidates(candidates, []);

    expect(result).toHaveLength(2);
  });
});

describe('rerankCandidates freshness caching optimization', () => {
  function makeCandidateWithMeta(
    id: string,
    score: number,
    decayMeta: DecayMeta,
  ): MergedCandidate {
    return {
      entry: {
        id,
        scope: 'global',
        shortcut: `test-${id}`,
        detail: `Test entry ${id}`,
        labels: ['test'],
        requiredLevel: 'user',
        decayMeta,
      } as KnowledgeRecord,
      semanticScore: score,
      keywordScore: 0,
      combinedScore: score,
      tokenMatches: [],
      channels: ['semantic'],
      preRerankScore: score,
      finalScore: score,
    };
  }

  it('produces consistent results with caching (entries sharing lastVerifiedAt)', () => {
    // Two entries with the same lastVerifiedAt should get the same multiplier
    const sameTimestamp = '2026-04-02T00:00:00Z';
    const metaA: DecayMeta = {
      lastVerifiedAt: sameTimestamp,
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };
    const metaB: DecayMeta = {
      lastVerifiedAt: sameTimestamp,
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };

    const candidates = [
      makeCandidateWithMeta('entry-a', 0.8, metaA),
      makeCandidateWithMeta('entry-b', 0.6, metaB),
    ];

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    });

    // Both should have the same decay multiplier since they share lastVerifiedAt
    const entryA = result.find((c) => c.entry.id === 'entry-a')!;
    const entryB = result.find((c) => c.entry.id === 'entry-b')!;

    expect(entryA.decayMultiplier).toBeDefined();
    expect(entryB.decayMultiplier).toBeDefined();
    expect(entryA.decayMultiplier).toBe(entryB.decayMultiplier);

    // Verify scores are proportional to their input scores
    expect(entryA.combinedScore).toBeGreaterThan(entryB.combinedScore);
  });

  it('evergreen entries with null decayMeta are not cached', () => {
    const candidates = [
      makeCandidateWithMeta('evergreen-1', 0.8, {
        lastVerifiedAt: '2025-05-02T00:00:00Z',
        decayState: 'active',
        supersededById: null,
        decayStateComputedAt: '2026-05-02T00:00:00Z',
        freshnessType: 'evergreen',
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    });

    // Evergreen should have no decay multiplier
    expect(result[0].decayMultiplier).toBeUndefined();
    expect(result[0].combinedScore).toBe(0.8);
  });

  it('Date object created once affects all candidates consistently', () => {
    // If Date was created per-candidate, slight timing differences could
    // produce slightly different multipliers. With hoisted Date, all candidates
    // use the exact same timestamp.
    const volatileMeta: DecayMeta = {
      lastVerifiedAt: '2026-04-02T00:00:00Z',
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };

    // 10 candidates with same metadata but different IDs
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidateWithMeta(`entry-${i}`, 0.5, { ...volatileMeta }),
    );

    const result = rerankCandidates(candidates, [], {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    });

    // All should have the exact same decay multiplier
    const multipliers = result.map((c) => c.decayMultiplier);
    const uniqueMultipliers = new Set(multipliers);
    expect(uniqueMultipliers.size).toBe(1);
  });
});
