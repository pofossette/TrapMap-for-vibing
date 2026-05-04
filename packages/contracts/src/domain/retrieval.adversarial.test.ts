/**
 * Adversarial tests for retrieval schema validation.
 * Phase 71 Gap 4: Probes hard behavioral edges in retrieval contracts:
 * - Score boundary values (0 and 1 exactly)
 * - MaxResults boundaries (1 and 50)
 * - Seed string length boundaries
 * - Nullable vs optional field behavior
 * - Enum completeness for strategy and mode
 */
import { describe, expect, it } from 'vitest';
import {
  retrievalQueryModeSchema,
  retrievalFiltersSchema,
  retrievalCitationSchema,
  retrievalQuerySchema,
  retrievalMatchSchema,
  capsuleMatchSchema,
  retrievalV2QuerySchema,
  retrievalV2ResponseSchema,
  retrievalStrategySchema,
  routingTraceSchema,
} from './retrieval.js';

describe('retrieval schema adversarial tests', () => {
  describe('retrievalQueryModeSchema completeness', () => {
    it('rejects all near-miss mode values', () => {
      const nearMisses = ['Semantic', 'HYBRID', 'graph_assisted', 'graph', 'fulltext', ''];
      for (const mode of nearMisses) {
        expect(() => retrievalQueryModeSchema.parse(mode)).toThrow();
      }
    });
  });

  describe('retrievalQuerySchema boundary values', () => {
    it('accepts seed at exactly 2000 chars and rejects 2001', () => {
      expect(() =>
        retrievalQuerySchema.parse({ seed: 'a'.repeat(2000) }),
      ).not.toThrow();

      expect(() =>
        retrievalQuerySchema.parse({ seed: 'a'.repeat(2001) }),
      ).toThrow();
    });

    it('accepts seed at exactly 1 char', () => {
      const query = retrievalQuerySchema.parse({ seed: 'x' });
      expect(query.seed).toBe('x');
    });

    it('rejects empty seed', () => {
      expect(() =>
        retrievalQuerySchema.parse({ seed: '' }),
      ).toThrow();
    });

    it('accepts maxResults at minimum (1) and rejects 0', () => {
      expect(() =>
        retrievalQuerySchema.parse({ seed: 'test', maxResults: 1 }),
      ).not.toThrow();

      expect(() =>
        retrievalQuerySchema.parse({ seed: 'test', maxResults: 0 }),
      ).toThrow();
    });

    it('accepts maxResults at maximum (50) and rejects 51', () => {
      expect(() =>
        retrievalQuerySchema.parse({ seed: 'test', maxResults: 50 }),
      ).not.toThrow();

      expect(() =>
        retrievalQuerySchema.parse({ seed: 'test', maxResults: 51 }),
      ).toThrow();
    });

    it('rejects negative maxResults', () => {
      expect(() =>
        retrievalQuerySchema.parse({ seed: 'test', maxResults: -1 }),
      ).toThrow();
    });
  });

  describe('retrievalCitationSchema score boundaries', () => {
    const validCitationBase = {
      source: {
        entryId: 'entry-1',
        scope: 'global',
        shortcut: 'Fix login',
      },
      snippet: 'Use async/await for authentication',
      tags: ['auth'],
      recallChannels: ['semantic'],
    };

    it('accepts scores at exact boundary 0', () => {
      const citation = retrievalCitationSchema.parse({
        ...validCitationBase,
        scores: {
          semantic: 0,
          keyword: 0,
          graph: 0,
          preRerank: 0,
          final: 0,
        },
      });
      expect(citation.scores.semantic).toBe(0);
      expect(citation.scores.final).toBe(0);
    });

    it('accepts scores at exact boundary 1', () => {
      const citation = retrievalCitationSchema.parse({
        ...validCitationBase,
        scores: {
          semantic: 1,
          keyword: 1,
          graph: null,
          preRerank: 1,
          final: 1,
        },
      });
      expect(citation.scores.semantic).toBe(1);
      expect(citation.scores.preRerank).toBe(1);
    });

    it('rejects preRerank score of 1.01', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitationBase,
          scores: {
            semantic: 0.5,
            keyword: 0.5,
            graph: null,
            preRerank: 1.01,
            final: 0.5,
          },
        }),
      ).toThrow();
    });

    it('rejects final score of -0.01', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitationBase,
          scores: {
            semantic: 0.5,
            keyword: 0.5,
            graph: null,
            preRerank: 0.5,
            final: -0.01,
          },
        }),
      ).toThrow();
    });

    it('requires non-empty snippet', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitationBase,
          snippet: '',
        }),
      ).toThrow();
    });

    it('requires at least one recallChannel', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitationBase,
          recallChannels: [],
        }),
      ).toThrow();
    });
  });

  describe('capsuleMatchSchema content boundary', () => {
    const validCapsuleBase = {
      capsuleId: 'capsule-1',
      artifactId: 'artifact-1',
      revision: 1,
      sourcePaths: ['/src/auth.ts'],
      content: 'Valid content',
      situation: 'Situation',
      problem: 'Problem',
      goal: 'Goal',
      labels: ['auth'],
      scope: 'global',
      requiredLevel: 5,
      score: 0.9,
      reason: 'Direct match',
    };

    it('accepts content at exactly 5000 chars and rejects 5001', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, content: 'a'.repeat(5000) }),
      ).not.toThrow();

      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, content: 'a'.repeat(5001) }),
      ).toThrow();
    });

    it('rejects empty content', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, content: '' }),
      ).toThrow();
    });

    it('accepts score at 0 and 1 boundaries', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, score: 0 }),
      ).not.toThrow();

      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, score: 1 }),
      ).not.toThrow();
    });

    it('rejects score of 1.01', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, score: 1.01 }),
      ).toThrow();
    });

    it('rejects negative score', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, score: -0.01 }),
      ).toThrow();
    });

    it('requires at least one label', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, labels: [] }),
      ).toThrow();
    });

    it('requires at least one sourcePath', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, sourcePaths: [] }),
      ).toThrow();
    });

    it('rejects revision of 0', () => {
      expect(() =>
        capsuleMatchSchema.parse({ ...validCapsuleBase, revision: 0 }),
      ).toThrow();
    });
  });

  describe('retrievalV2QuerySchema edge cases', () => {
    it('accepts seed at exactly 2000 chars', () => {
      expect(() =>
        retrievalV2QuerySchema.parse({ seed: 'x'.repeat(2000) }),
      ).not.toThrow();
    });

    it('rejects seed at 2001 chars', () => {
      expect(() =>
        retrievalV2QuerySchema.parse({ seed: 'x'.repeat(2001) }),
      ).toThrow();
    });

    it('rejects empty seed', () => {
      expect(() =>
        retrievalV2QuerySchema.parse({ seed: '' }),
      ).toThrow();
    });

    it('defaults maxResults to 10', () => {
      const query = retrievalV2QuerySchema.parse({ seed: 'test' });
      expect(query.maxResults).toBe(10);
    });

    it('defaults includeSummary to false', () => {
      const query = retrievalV2QuerySchema.parse({ seed: 'test' });
      expect(query.includeSummary).toBe(false);
    });
  });

  describe('retrievalV2ResponseSchema edge cases', () => {
    it('requires refinementSummary (not optional)', () => {
      expect(() =>
        retrievalV2ResponseSchema.parse({}),
      ).toThrow();
    });

    it('accepts refinementSummary as null', () => {
      const response = retrievalV2ResponseSchema.parse({ refinementSummary: null });
      expect(response.refinementSummary).toBeNull();
    });

    it('accepts refinementSummary as string', () => {
      const response = retrievalV2ResponseSchema.parse({
        refinementSummary: 'Refined results',
      });
      expect(response.refinementSummary).toBe('Refined results');
    });

    it('defaults capsules to empty array', () => {
      const response = retrievalV2ResponseSchema.parse({ refinementSummary: null });
      expect(response.capsules).toEqual([]);
    });

    it('defaults profileHints to empty array', () => {
      const response = retrievalV2ResponseSchema.parse({ refinementSummary: null });
      expect(response.profileHints).toEqual([]);
    });

    it('defaults summary to null', () => {
      const response = retrievalV2ResponseSchema.parse({ refinementSummary: null });
      expect(response.summary).toBeNull();
    });
  });

  describe('retrievalStrategySchema completeness', () => {
    it('rejects common misspellings and near-misses', () => {
      const nearMisses = ['hybrid-search', 'fulltext', 'dense', 'sparse', 'auto-detect', 'LOCAL', ''];
      for (const strategy of nearMisses) {
        expect(() => retrievalStrategySchema.parse(strategy)).toThrow();
      }
    });
  });

  describe('routingTraceSchema edge cases', () => {
    const validTrace = {
      selectedMode: 'local' as const,
      routeFamily: 'capsule' as const,
      routingReason: 'auto-goal-query' as const,
    };

    it('defaults all optional fields correctly', () => {
      const trace = routingTraceSchema.parse(validTrace);
      expect(trace.channelsUsed).toEqual([]);
      expect(trace.fallbackApplied).toBe(false);
      expect(trace.confidenceScore).toBeNull();
      expect(trace.confidenceBucket).toBeNull();
      expect(trace.fallbackTarget).toBeNull();
    });

    it('accepts confidenceScore at boundaries (0 and 1)', () => {
      expect(() =>
        routingTraceSchema.parse({ ...validTrace, confidenceScore: 0 }),
      ).not.toThrow();

      expect(() =>
        routingTraceSchema.parse({ ...validTrace, confidenceScore: 1 }),
      ).not.toThrow();
    });

    it('rejects confidenceScore above 1', () => {
      expect(() =>
        routingTraceSchema.parse({ ...validTrace, confidenceScore: 1.01 }),
      ).toThrow();
    });

    it('rejects confidenceScore below 0', () => {
      expect(() =>
        routingTraceSchema.parse({ ...validTrace, confidenceScore: -0.01 }),
      ).toThrow();
    });

    it('requires valid routeFamily', () => {
      expect(() =>
        routingTraceSchema.parse({ ...validTrace, routeFamily: 'invalid' }),
      ).toThrow();
    });

    it('accepts all valid routeFamily values', () => {
      const families = ['entry', 'capsule', 'graph-plan'] as const;
      for (const family of families) {
        expect(() =>
          routingTraceSchema.parse({ ...validTrace, routeFamily: family }),
        ).not.toThrow();
      }
    });
  });

  describe('retrievalFiltersSchema edge cases', () => {
    it('defaults labels and scopes when omitted', () => {
      const filters = retrievalFiltersSchema.parse({});
      expect(filters.labels).toEqual([]);
      expect(filters.scopes).toEqual([]);
    });

    it('defaults labels and scopes when only teamId provided', () => {
      const filters = retrievalFiltersSchema.parse({ teamId: 'team-1' });
      expect(filters.labels).toEqual([]);
      expect(filters.scopes).toEqual([]);
      expect(filters.teamId).toBe('team-1');
    });

    it('accepts null teamId', () => {
      const filters = retrievalFiltersSchema.parse({ teamId: null });
      expect(filters.teamId).toBeNull();
    });
  });
});
