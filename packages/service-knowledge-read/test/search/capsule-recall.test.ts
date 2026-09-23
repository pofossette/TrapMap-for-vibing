import { describe, expect, it } from 'vitest';

import {
  assembleCapsuleResults,
  type CapsuleRow,
  heuristicCapsuleChannel,
} from '../../src/search/capsule-recall.js';
import {
  CAPSULE_DIMENSION_WEIGHTS,
  combineFinalScore,
  DEFAULT_MIN_CAPSULE_SCORE,
  fuseChannelRanks,
  normalizeFused,
  resolveMinCapsuleScore,
  rrfContribution,
  scoreCapsuleDimensions,
  tokenizeForScoring,
} from '../../src/search/capsule-scoring.js';

function capsule(overrides: Partial<CapsuleRow> & { capsuleId: string }): CapsuleRow {
  return {
    artifactId: `artifact_${overrides.capsuleId}`,
    revision: 1,
    sourcePaths: ['SKILL.md'],
    content: 'generic content',
    situation: null,
    problem: null,
    goal: null,
    contextualPrefix: null,
    labels: ['test'],
    scope: 'global',
    requiredLevel: 0,
    teamId: null,
    title: 'Title',
    slug: 'slug',
    ...overrides,
  };
}

describe('capsule scoring', () => {
  it('keeps the documented dimension weights summing to one', () => {
    const sum = Object.values(CAPSULE_DIMENSION_WEIGHTS).reduce((total, w) => total + w, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('gives full coverage when every query token appears in the field', () => {
    const scores = scoreCapsuleDimensions(tokenizeForScoring('redis stampede'), {
      ...capsule({ capsuleId: 'c1' }),
      problem: 'redis stampede during cold start',
    });
    expect(scores.problem).toBe(1);
    expect(scores.total).toBeGreaterThan(0);
    expect(scores.total).toBeLessThanOrEqual(1);
  });

  it('scores an unrelated capsule at zero across every dimension', () => {
    const scores = scoreCapsuleDimensions(tokenizeForScoring('redis stampede'), {
      ...capsule({ capsuleId: 'c2' }),
      problem: 'react hydration mismatch',
      content: 'react hydration mismatch after server render',
    });
    expect(scores.total).toBe(0);
  });

  it('treats a missing query token set as zero rather than throwing', () => {
    expect(scoreCapsuleDimensions(tokenizeForScoring(''), capsule({ capsuleId: 'c3' })).total).toBe(
      0,
    );
  });

  it('drops single-character tokens so they cannot inflate coverage', () => {
    expect([...tokenizeForScoring('a bb ccc')].sort()).toEqual(['bb', 'ccc']);
  });

  it('blends content and fusion into a bounded final score', () => {
    expect(combineFinalScore(1, 1)).toBe(1);
    expect(combineFinalScore(0, 0)).toBe(0);
    // Bounded even if a caller passes out-of-range inputs.
    expect(combineFinalScore(2, 2)).toBe(1);
    expect(combineFinalScore(-1, -1)).toBe(0);
  });
});

describe('capsule fusion', () => {
  it('ranks a capsule found by every channel above one found by a single channel', () => {
    const fused = fuseChannelRanks({
      keyword: ['shared', 'keyword-only'],
      semantic: ['shared', 'semantic-only'],
    });
    expect(fused.get('shared')).toBeGreaterThan(fused.get('keyword-only') ?? 0);
    expect(fused.get('shared')).toBeGreaterThan(fused.get('semantic-only') ?? 0);
  });

  it('ignores an empty channel instead of penalising the candidates', () => {
    // An empty vector index is a real state, not an error.
    const withEmpty = fuseChannelRanks({ keyword: ['a'], semantic: [] });
    expect(withEmpty.get('a')).toBeCloseTo(rrfContribution(1), 10);
  });

  it('normalises by the best achievable fusion so scores stay comparable', () => {
    const normalized = normalizeFused(new Map([['a', rrfContribution(1)]]), 1);
    expect(normalized.get('a')).toBeCloseTo(1, 10);
  });

  it('returns rank-zero contribution for an out-of-range rank', () => {
    expect(rrfContribution(0)).toBe(0);
  });
});

describe('capsule threshold', () => {
  it('falls back to the documented default when the override is absent or invalid', () => {
    expect(resolveMinCapsuleScore({})).toBe(DEFAULT_MIN_CAPSULE_SCORE);
    expect(resolveMinCapsuleScore({ TRAPMAP_MIN_CAPSULE_SCORE: 'not-a-number' })).toBe(
      DEFAULT_MIN_CAPSULE_SCORE,
    );
    expect(resolveMinCapsuleScore({ TRAPMAP_MIN_CAPSULE_SCORE: '2' })).toBe(
      DEFAULT_MIN_CAPSULE_SCORE,
    );
  });

  it('honours a valid override', () => {
    expect(resolveMinCapsuleScore({ TRAPMAP_MIN_CAPSULE_SCORE: '0.42' })).toBe(0.42);
  });
});

describe('capsule assembly', () => {
  const queryTokens = tokenizeForScoring('redis stampede');

  it('never surfaces a capsule that no channel ranked, however well it scores', () => {
    const relevant = capsule({
      capsuleId: 'relevant',
      problem: 'redis stampede during cold start',
    });
    const unranked = capsule({
      capsuleId: 'unranked',
      problem: 'redis stampede during cold start',
    });

    const result = assembleCapsuleResults({
      pool: [relevant, unranked],
      channelIds: { keyword: ['relevant'], semantic: [], heuristic: [] },
      queryTokens,
      maxResults: 10,
      minScore: 0,
    });

    expect(result.capsules.map((entry) => entry.capsuleId)).toEqual(['relevant']);
    expect(result.candidateCount).toBe(1);
  });

  it('gates out candidates below the floor and reports how many', () => {
    const weak = capsule({ capsuleId: 'weak', content: 'unrelated body' });
    const result = assembleCapsuleResults({
      pool: [weak],
      channelIds: { keyword: ['weak'], semantic: [] },
      queryTokens,
      maxResults: 10,
      minScore: 0.99,
    });

    expect(result.capsules).toHaveLength(0);
    expect(result.gatedOutCount).toBe(1);
  });

  it('emits one profile hint per artifact even when several capsules match it', () => {
    const first = capsule({
      capsuleId: 'a1',
      artifactId: 'artifact_shared',
      problem: 'redis stampede',
    });
    const second = capsule({
      capsuleId: 'a2',
      artifactId: 'artifact_shared',
      problem: 'redis stampede',
    });

    const result = assembleCapsuleResults({
      pool: [first, second],
      channelIds: { keyword: ['a1', 'a2'] },
      queryTokens,
      maxResults: 10,
      minScore: 0,
    });

    expect(result.profileHints).toHaveLength(1);
    expect(result.profileHints[0]?.artifactId).toBe('artifact_shared');
    expect(result.capsules).toHaveLength(2);
  });

  it('substitutes required non-empty fields so the response contract always parses', () => {
    // The DB allows empty text where the response schema demands min(1).
    const sparse = capsule({
      capsuleId: 'sparse',
      problem: 'redis stampede',
      labels: [],
      sourcePaths: [],
      situation: '',
      goal: '',
    });

    const result = assembleCapsuleResults({
      pool: [sparse],
      channelIds: { keyword: ['sparse'] },
      queryTokens,
      maxResults: 10,
      minScore: 0,
    });

    const match = result.capsules[0];
    expect(match?.situation).toBeNull();
    expect(match?.goal).toBeNull();
    expect(match?.labels).toEqual(['uncategorized']);
    expect(match?.sourcePaths).toEqual(['SKILL.md']);
  });

  it('ranks by content overlap when fusion is equal', () => {
    const strong = capsule({
      capsuleId: 'strong',
      problem: 'redis stampede',
      content: 'redis stampede',
    });
    const weak = capsule({ capsuleId: 'weak', problem: 'redis', content: 'redis' });

    const result = assembleCapsuleResults({
      pool: [strong, weak],
      channelIds: { keyword: ['strong', 'weak'] },
      queryTokens,
      maxResults: 10,
      minScore: 0,
    });

    expect(result.capsules[0]?.capsuleId).toBe('strong');
  });

  it('reports only channels that actually returned candidates', () => {
    const result = assembleCapsuleResults({
      pool: [capsule({ capsuleId: 'a', problem: 'redis stampede' })],
      channelIds: { keyword: ['a'], semantic: [], heuristic: [] },
      queryTokens,
      maxResults: 10,
      minScore: 0,
    });

    expect(result.channelsUsed).toEqual(['keyword']);
    expect(result.channelSizes).toEqual({ keyword: 1, semantic: 0, heuristic: 0 });
  });
});

describe('heuristic capsule channel', () => {
  it('returns nothing for a query with no lexical signal', () => {
    const ids = heuristicCapsuleChannel(
      tokenizeForScoring('redis stampede'),
      [capsule({ capsuleId: 'a', content: 'react hydration' })],
      10,
    );
    expect(ids).toEqual([]);
  });

  it('orders by content score and honours the limit', () => {
    const ids = heuristicCapsuleChannel(
      tokenizeForScoring('redis stampede'),
      [
        capsule({ capsuleId: 'weak', problem: 'redis' }),
        capsule({ capsuleId: 'strong', problem: 'redis stampede cold start' }),
      ],
      1,
    );
    expect(ids).toEqual(['strong']);
  });
});
