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
// Phase 54: Boundary-aware rerank scoring (BOUND-04)
// =============================================================================

describe('rerankCandidates with boundary context', () => {
  function makeCandidate(
    id: string,
    score: number,
    boundary?: { context?: string[]; exclusions?: { description: string; kind?: string }[] },
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
          : null,
      } as any,
      semanticScore: score,
      keywordScore: 0,
      combinedScore: score,
      tokenMatches: [],
      channels: ['semantic'],
      preRerankScore: score,
      finalScore: score,
    };
  }

  it('applies excluded context penalty in rerank', () => {
    const candidates = [
      makeCandidate('no-boundary', 0.8),
      makeCandidate('excluded', 0.8, {
        exclusions: [{ description: 'not for frontend', kind: 'context' }],
      }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['frontend'], versions: [] },
    });

    // no-boundary should rank first since excluded gets penalty
    expect(result[0].entry.id).toBe('no-boundary');
    expect(result[1].boundaryScoreDelta).toBe(-0.15);
  });

  it('applies preferred context boost in rerank', () => {
    const candidates = [
      makeCandidate('no-boundary', 0.8),
      makeCandidate('preferred', 0.8, { context: ['docker'] }),
    ];

    const result = rerankCandidates(candidates, [], {
      boundaryContext: { contexts: ['docker'], versions: [] },
    });

    // preferred should rank first
    expect(result[0].entry.id).toBe('preferred');
    expect(result[0].boundaryScoreDelta).toBe(0.10);
  });

  it('no boundary scoring when boundaryContext is not provided', () => {
    const candidates = [
      makeCandidate('entry-1', 0.8, {
        exclusions: [{ description: 'not for frontend', kind: 'context' }],
        context: ['docker'],
      }),
    ];

    const result = rerankCandidates(candidates, []);

    expect(result[0].boundaryScoreDelta).toBeUndefined();
  });
});
