/**
 * Unit tests for candidate merge module.
 *
 * Tests cover:
 * - Multi-path merge behavior (semantic, keyword, hybrid)
 * - Score calculation with default and custom weights
 * - Deterministic ordering and tiebreakers
 * - Channel tracking and token match preservation
 * - Conversion helpers (toScoredEntry, toScoredEntries)
 * - createSemanticCandidate and hasBothChannels utilities
 */

import { describe, expect, it } from 'vitest';

import type {
  MergedCandidate,
  RecallCandidate,
  TokenMatchDetail,
} from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import {
  DEFAULT_KEYWORD_WEIGHT,
  DEFAULT_SEMANTIC_WEIGHT,
  createSemanticCandidate,
  hasBothChannels,
  mergeCandidates,
  toScoredEntries,
  toScoredEntry,
} from './merge.js';

/**
 * Helper to create a minimal KnowledgeRecord for testing.
 */
function createTestEntry(overrides: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id: 'test_1',
    teamId: null,
    scope: 'global',
    labels: [],
    shortcut: '',
    detail: '',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      shortcut: '',
      detail: '',
      labels: [],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as KnowledgeRecord;
}

/**
 * Helper to create a keyword RecallCandidate.
 */
function createKeywordCandidate(
  entry: KnowledgeRecord,
  score: number,
  tokenMatches: TokenMatchDetail[] = [],
): RecallCandidate {
  return {
    entry,
    channel: 'keyword',
    score,
    tokenMatches,
  };
}

describe('merge module', () => {
  describe('mergeCandidates', () => {
    describe('basic merge behavior', () => {
      it('returns empty array when both channels are empty', () => {
        const result = mergeCandidates([], []);
        expect(result).toEqual([]);
      });

      it('preserves semantic-only candidates with semantic weight', () => {
        const entry = createTestEntry({ id: 'e1' });
        const semantic = [createSemanticCandidate(entry, 0.8)];

        const result = mergeCandidates(semantic, []);

        expect(result).toHaveLength(1);
        expect(result[0]!.entry.id).toBe('e1');
        expect(result[0]!.semanticScore).toBe(0.8);
        expect(result[0]!.keywordScore).toBe(0);
        expect(result[0]!.combinedScore).toBeCloseTo(0.8 * DEFAULT_SEMANTIC_WEIGHT);
        expect(result[0]!.channels).toEqual(['semantic']);
      });

      it('preserves keyword-only candidates with keyword weight', () => {
        const entry = createTestEntry({ id: 'e1' });
        const keyword = [createKeywordCandidate(entry, 0.9)];

        const result = mergeCandidates([], keyword);

        expect(result).toHaveLength(1);
        expect(result[0]!.entry.id).toBe('e1');
        expect(result[0]!.semanticScore).toBe(0);
        expect(result[0]!.keywordScore).toBe(0.9);
        expect(result[0]!.combinedScore).toBeCloseTo(0.9 * DEFAULT_KEYWORD_WEIGHT);
        expect(result[0]!.channels).toEqual(['keyword']);
      });

      it('combines scores when entry appears in both channels', () => {
        const entry = createTestEntry({ id: 'e1' });
        const semantic = [createSemanticCandidate(entry, 0.8)];
        const keywordMatches: TokenMatchDetail[] = [{ token: 'test', fields: ['shortcut'] }];
        const keyword = [createKeywordCandidate(entry, 0.6, keywordMatches)];

        const result = mergeCandidates(semantic, keyword);

        expect(result).toHaveLength(1);
        expect(result[0]!.semanticScore).toBe(0.8);
        expect(result[0]!.keywordScore).toBe(0.6);
        const expectedCombined = 0.8 * DEFAULT_SEMANTIC_WEIGHT + 0.6 * DEFAULT_KEYWORD_WEIGHT;
        expect(result[0]!.combinedScore).toBeCloseTo(expectedCombined);
        expect(result[0]!.channels).toEqual(['semantic', 'keyword']);
      });

      it('deduplicates by entry.id when same entry in both channels', () => {
        const entry = createTestEntry({ id: 'e1' });
        const semantic = [createSemanticCandidate(entry, 0.7)];
        const keyword = [createKeywordCandidate(entry, 0.5)];

        const result = mergeCandidates(semantic, keyword);

        expect(result).toHaveLength(1);
        expect(result[0]!.entry.id).toBe('e1');
      });
    });

    describe('score calculation', () => {
      it('applies DEFAULT_SEMANTIC_WEIGHT (0.6) to semantic-only score', () => {
        const entry = createTestEntry({ id: 'e1' });
        const result = mergeCandidates([createSemanticCandidate(entry, 1.0)], []);

        expect(result[0]!.combinedScore).toBeCloseTo(DEFAULT_SEMANTIC_WEIGHT);
      });

      it('applies DEFAULT_KEYWORD_WEIGHT (0.4) to keyword-only score', () => {
        const entry = createTestEntry({ id: 'e1' });
        const result = mergeCandidates([], [createKeywordCandidate(entry, 1.0)]);

        expect(result[0]!.combinedScore).toBeCloseTo(DEFAULT_KEYWORD_WEIGHT);
      });

      it('respects custom weights via MergeConfig', () => {
        const entry = createTestEntry({ id: 'e1' });
        const semantic = [createSemanticCandidate(entry, 1.0)];

        const result = mergeCandidates(semantic, [], {
          semanticWeight: 0.8,
          keywordWeight: 0.2,
        });

        expect(result[0]!.combinedScore).toBeCloseTo(0.8);
      });

      it('combines scores correctly with custom weights for merged entry', () => {
        const entry = createTestEntry({ id: 'e1' });
        const semantic = [createSemanticCandidate(entry, 0.9)];
        const keyword = [createKeywordCandidate(entry, 0.7)];

        const result = mergeCandidates(semantic, keyword, {
          semanticWeight: 0.3,
          keywordWeight: 0.7,
        });

        const expected = 0.9 * 0.3 + 0.7 * 0.7;
        expect(result[0]!.combinedScore).toBeCloseTo(expected);
      });
    });

    describe('determinism and ordering', () => {
      it('sorts by combined score descending', () => {
        const entryA = createTestEntry({ id: 'a' });
        const entryB = createTestEntry({ id: 'b' });
        const semantic = [
          createSemanticCandidate(entryA, 0.3),
          createSemanticCandidate(entryB, 0.9),
        ];

        const result = mergeCandidates(semantic, []);

        expect(result[0]!.entry.id).toBe('b');
        expect(result[1]!.entry.id).toBe('a');
      });

      it('uses entry.id as tiebreaker for stable ordering', () => {
        const entryA = createTestEntry({ id: 'a' });
        const entryB = createTestEntry({ id: 'b' });
        // Same score so tiebreaker applies
        const semantic = [
          createSemanticCandidate(entryA, 0.5),
          createSemanticCandidate(entryB, 0.5),
        ];

        const result = mergeCandidates(semantic, []);

        // Both have same combined score, so sorted by id ascending
        expect(result[0]!.entry.id).toBe('a');
        expect(result[1]!.entry.id).toBe('b');
      });

      it('produces identical results for identical inputs', () => {
        const entry1 = createTestEntry({ id: 'e1' });
        const entry2 = createTestEntry({ id: 'e2' });
        const semantic = [
          createSemanticCandidate(entry1, 0.7),
          createSemanticCandidate(entry2, 0.4),
        ];
        const keyword = [createKeywordCandidate(entry1, 0.5)];

        const result1 = mergeCandidates(semantic, keyword);
        const result2 = mergeCandidates(semantic, keyword);

        expect(result1).toEqual(result2);
      });
    });

    describe('channel tracking', () => {
      it('sets channels: ["semantic"] for semantic-only', () => {
        const entry = createTestEntry({ id: 'e1' });
        const result = mergeCandidates([createSemanticCandidate(entry, 0.8)], []);

        expect(result[0]!.channels).toEqual(['semantic']);
      });

      it('sets channels: ["keyword"] for keyword-only', () => {
        const entry = createTestEntry({ id: 'e1' });
        const result = mergeCandidates([], [createKeywordCandidate(entry, 0.8)]);

        expect(result[0]!.channels).toEqual(['keyword']);
      });

      it('sets channels: ["semantic", "keyword"] for merged entry', () => {
        const entry = createTestEntry({ id: 'e1' });
        const result = mergeCandidates(
          [createSemanticCandidate(entry, 0.8)],
          [createKeywordCandidate(entry, 0.6)],
        );

        expect(result[0]!.channels).toEqual(['semantic', 'keyword']);
      });
    });

    describe('token match preservation', () => {
      it('preserves tokenMatches from keyword channel', () => {
        const entry = createTestEntry({ id: 'e1' });
        const tokenMatches: TokenMatchDetail[] = [
          { token: 'jwt', fields: ['shortcut', 'detail'] },
          { token: 'auth', fields: ['labels'] },
        ];
        const result = mergeCandidates([], [createKeywordCandidate(entry, 0.8, tokenMatches)]);

        expect(result[0]!.tokenMatches).toEqual(tokenMatches);
      });

      it('sets empty tokenMatches for semantic-only candidate', () => {
        const entry = createTestEntry({ id: 'e1' });
        const result = mergeCandidates([createSemanticCandidate(entry, 0.8)], []);

        expect(result[0]!.tokenMatches).toEqual([]);
      });

      it('uses keyword tokenMatches when entry is in both channels', () => {
        const entry = createTestEntry({ id: 'e1' });
        const tokenMatches: TokenMatchDetail[] = [{ token: 'jwt', fields: ['shortcut'] }];
        const result = mergeCandidates(
          [createSemanticCandidate(entry, 0.8)],
          [createKeywordCandidate(entry, 0.6, tokenMatches)],
        );

        expect(result[0]!.tokenMatches).toEqual(tokenMatches);
      });
    });

    describe('maxCandidates limit', () => {
      it('respects maxCandidates config option', () => {
        const entries = [
          createTestEntry({ id: 'e1' }),
          createTestEntry({ id: 'e2' }),
          createTestEntry({ id: 'e3' }),
        ];
        const semantic = entries.map((e) => createSemanticCandidate(e, 0.5));

        const result = mergeCandidates(semantic, [], { maxCandidates: 2 });

        expect(result).toHaveLength(2);
      });

      it('returns all candidates when maxCandidates not specified', () => {
        const entries = [
          createTestEntry({ id: 'e1' }),
          createTestEntry({ id: 'e2' }),
          createTestEntry({ id: 'e3' }),
        ];
        const semantic = entries.map((e) => createSemanticCandidate(e, 0.5));

        const result = mergeCandidates(semantic, []);

        expect(result).toHaveLength(3);
      });

      it('returns all candidates when maxCandidates is 0', () => {
        const entries = [createTestEntry({ id: 'e1' }), createTestEntry({ id: 'e2' })];
        const semantic = entries.map((e) => createSemanticCandidate(e, 0.5));

        const result = mergeCandidates(semantic, [], { maxCandidates: 0 });

        expect(result).toHaveLength(2);
      });
    });
  });

  describe('toScoredEntry', () => {
    it('converts MergedCandidate to ScoredEntry with combinedScore', () => {
      const entry = createTestEntry({ id: 'e1' });
      const merged: MergedCandidate = {
        entry,
        semanticScore: 0.8,
        keywordScore: 0.6,
        combinedScore: 0.72,
        tokenMatches: [],
        channels: ['semantic', 'keyword'],
        preRerankScore: 0.72,
        finalScore: 0.72,
      };

      const scored = toScoredEntry(merged);

      expect(scored.entry).toBe(entry);
      expect(scored.score).toBe(0.72);
    });
  });

  describe('toScoredEntries', () => {
    it('batch conversion preserves order', () => {
      const entry1 = createTestEntry({ id: 'e1' });
      const entry2 = createTestEntry({ id: 'e2' });
      const merged: MergedCandidate[] = [
        {
          entry: entry1,
          semanticScore: 0.8,
          keywordScore: 0,
          combinedScore: 0.48,
          tokenMatches: [],
          channels: ['semantic'],
          preRerankScore: 0.48,
          finalScore: 0.48,
        },
        {
          entry: entry2,
          semanticScore: 0,
          keywordScore: 0.9,
          combinedScore: 0.36,
          tokenMatches: [],
          channels: ['keyword'],
          preRerankScore: 0.36,
          finalScore: 0.36,
        },
      ];

      const scored = toScoredEntries(merged);

      expect(scored).toHaveLength(2);
      expect(scored[0]!.entry.id).toBe('e1');
      expect(scored[0]!.score).toBe(0.48);
      expect(scored[1]!.entry.id).toBe('e2');
      expect(scored[1]!.score).toBe(0.36);
    });

    it('returns empty array for empty input', () => {
      expect(toScoredEntries([])).toEqual([]);
    });
  });

  describe('createSemanticCandidate', () => {
    it('creates RecallCandidate with channel: semantic', () => {
      const entry = createTestEntry({ id: 'e1' });

      const candidate = createSemanticCandidate(entry, 0.85);

      expect(candidate.entry).toBe(entry);
      expect(candidate.channel).toBe('semantic');
      expect(candidate.score).toBe(0.85);
    });

    it('sets empty tokenMatches array', () => {
      const entry = createTestEntry({ id: 'e1' });

      const candidate = createSemanticCandidate(entry, 0.5);

      expect(candidate.tokenMatches).toEqual([]);
    });
  });

  describe('hasBothChannels', () => {
    it('returns true when channels includes both semantic and keyword', () => {
      const merged: MergedCandidate = {
        entry: createTestEntry({ id: 'e1' }),
        semanticScore: 0.8,
        keywordScore: 0.6,
        combinedScore: 0.72,
        tokenMatches: [],
        channels: ['semantic', 'keyword'],
        preRerankScore: 0.72,
        finalScore: 0.72,
      };

      expect(hasBothChannels(merged)).toBe(true);
    });

    it('returns false when only semantic channel', () => {
      const merged: MergedCandidate = {
        entry: createTestEntry({ id: 'e1' }),
        semanticScore: 0.8,
        keywordScore: 0,
        combinedScore: 0.48,
        tokenMatches: [],
        channels: ['semantic'],
        preRerankScore: 0.48,
        finalScore: 0.48,
      };

      expect(hasBothChannels(merged)).toBe(false);
    });

    it('returns false when only keyword channel', () => {
      const merged: MergedCandidate = {
        entry: createTestEntry({ id: 'e1' }),
        semanticScore: 0,
        keywordScore: 0.6,
        combinedScore: 0.24,
        tokenMatches: [],
        channels: ['keyword'],
        preRerankScore: 0.24,
        finalScore: 0.24,
      };

      expect(hasBothChannels(merged)).toBe(false);
    });
  });
});
