import { describe, expect, it } from 'vitest';
import {
  capsuleMatchSchema,
  graphPlanSearchResponseSchema,
  retrievalCitationSchema,
  retrievalFiltersSchema,
  retrievalMatchSchema,
  retrievalQueryModeSchema,
  retrievalQuerySchema,
  retrievalStrategySchema,
  retrievalV2QuerySchema,
  retrievalV2ResponseSchema,
  retrievalV2ResponseWithHintsSchema,
  routingTraceSchema,
} from './retrieval.js';

describe('retrieval schema contracts', () => {
  describe('retrievalQueryModeSchema', () => {
    it('accepts valid modes (semantic, hybrid, graph-assisted)', () => {
      expect(retrievalQueryModeSchema.parse('semantic')).toBe('semantic');
      expect(retrievalQueryModeSchema.parse('hybrid')).toBe('hybrid');
      expect(retrievalQueryModeSchema.parse('graph-assisted')).toBe('graph-assisted');
    });

    it('rejects invalid mode', () => {
      expect(() => retrievalQueryModeSchema.parse('invalid')).toThrow();
    });
  });

  describe('retrievalFiltersSchema', () => {
    it('accepts empty filters', () => {
      const filters = retrievalFiltersSchema.parse({});
      expect(filters.labels).toEqual([]);
      expect(filters.scopes).toEqual([]);
    });

    it('accepts filters with teamId', () => {
      const filters = retrievalFiltersSchema.parse({
        teamId: 'team-1',
      });
      expect(filters.teamId).toBe('team-1');
    });

    it('defaults labels and scopes to empty arrays', () => {
      const filters = retrievalFiltersSchema.parse({
        teamId: 'team-1',
      });
      expect(filters.labels).toEqual([]);
      expect(filters.scopes).toEqual([]);
    });

    it('accepts null teamId', () => {
      const filters = retrievalFiltersSchema.parse({
        teamId: null,
      });
      expect(filters.teamId).toBeNull();
    });
  });

  describe('retrievalCitationSchema', () => {
    const validCitation = {
      source: {
        entryId: 'entry-1',
        scope: 'global',
        shortcut: 'Fix login',
      },
      snippet: 'Use async/await for authentication',
      tags: ['auth', 'async'],
      recallChannels: ['semantic', 'keyword'],
      scores: {
        semantic: 0.85,
        keyword: 0.72,
        graph: null,
        preRerank: 0.8,
        final: 0.9,
      },
    };

    it('accepts complete citation', () => {
      const citation = retrievalCitationSchema.parse(validCitation);
      expect(citation.source.entryId).toBe('entry-1');
      expect(citation.snippet).toBe('Use async/await for authentication');
      expect(citation.recallChannels).toHaveLength(2);
    });

    it('requires non-empty snippet', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitation,
          snippet: '',
        }),
      ).toThrow();
    });

    it('requires at least one recallChannel', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitation,
          recallChannels: [],
        }),
      ).toThrow();
    });

    it('allows all-null semantic/keyword/graph scores (preRerank and final suffice for audit trail)', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitation,
          scores: {
            semantic: null,
            keyword: null,
            graph: null,
            preRerank: 0.5,
            final: 0.6,
          },
        }),
      ).not.toThrow();
    });

    it('accepts when exactly one of semantic/keyword/graph is non-null', () => {
      const citation = retrievalCitationSchema.parse({
        ...validCitation,
        scores: {
          semantic: null,
          keyword: 0.7,
          graph: null,
          preRerank: 0.5,
          final: 0.6,
        },
      });
      expect(citation.scores.keyword).toBe(0.7);
    });

    it('rejects scores outside 0-1 range', () => {
      expect(() =>
        retrievalCitationSchema.parse({
          ...validCitation,
          scores: {
            semantic: 1.5,
            keyword: 0.5,
            graph: null,
            preRerank: 0.5,
            final: 0.6,
          },
        }),
      ).toThrow();
    });
  });

  describe('retrievalQuerySchema', () => {
    it('accepts minimal query (seed only)', () => {
      const query = retrievalQuerySchema.parse({
        seed: 'How to fix authentication error',
      });
      expect(query.seed).toBe('How to fix authentication error');
    });

    it('defaults maxResults to 10', () => {
      const query = retrievalQuerySchema.parse({
        seed: 'Test query',
      });
      expect(query.maxResults).toBe(10);
    });

    it('defaults mode to semantic', () => {
      const query = retrievalQuerySchema.parse({
        seed: 'Test query',
      });
      expect(query.mode).toBe('semantic');
    });

    it('rejects seed over 2000 chars', () => {
      expect(() =>
        retrievalQuerySchema.parse({
          seed: 'a'.repeat(2001),
        }),
      ).toThrow();
    });

    it('rejects maxResults over 50', () => {
      expect(() =>
        retrievalQuerySchema.parse({
          seed: 'Test query',
          maxResults: 51,
        }),
      ).toThrow();
    });

    it('accepts boundaryContext option', () => {
      const query = retrievalQuerySchema.parse({
        seed: 'Test query',
        boundaryContext: {
          contexts: ['frontend', 'production'],
        },
      });
      expect(query.boundaryContext?.contexts).toEqual(['frontend', 'production']);
    });
  });

  describe('retrievalMatchSchema', () => {
    const validMatch = {
      entryId: 'entry-1',
      scope: 'global',
      requiredLevel: 5, // securityLevelSchema is number 0-10
      shortcut: 'Fix login',
      detail: 'Authentication fix details',
      labels: ['auth'],
      score: 0.85,
      reason: 'High semantic similarity',
    };

    it('accepts complete match', () => {
      const match = retrievalMatchSchema.parse(validMatch);
      expect(match.entryId).toBe('entry-1');
      expect(match.score).toBe(0.85);
    });

    it('makes citation optional', () => {
      const match = retrievalMatchSchema.parse(validMatch);
      expect(match.citation).toBeUndefined();
    });

    it('makes conflicts optional', () => {
      const match = retrievalMatchSchema.parse(validMatch);
      expect(match.conflicts).toBeUndefined();
    });

    it('makes boundaryExplanation optional', () => {
      const match = retrievalMatchSchema.parse(validMatch);
      expect(match.boundaryExplanation).toBeUndefined();
    });

    it('requires valid securityLevel (number 0-10)', () => {
      expect(() =>
        retrievalMatchSchema.parse({
          ...validMatch,
          requiredLevel: 15, // out of range
        }),
      ).toThrow();
    });
  });

  describe('capsuleMatchSchema', () => {
    const validCapsule = {
      capsuleId: 'capsule-1',
      artifactId: 'artifact-1',
      revision: 1,
      sourcePaths: ['/src/auth.ts'],
      content: 'Use async/await for authentication callbacks',
      situation: 'User login fails intermittently',
      problem: 'Race condition in auth flow',
      goal: 'Implement proper async handling',
      labels: ['auth', 'async'],
      scope: 'global',
      requiredLevel: 5, // securityLevelSchema is number 0-10
      score: 0.9,
      reason: 'Direct match for authentication issue',
    };

    it('accepts complete capsule match', () => {
      const capsule = capsuleMatchSchema.parse(validCapsule);
      expect(capsule.capsuleId).toBe('capsule-1');
      expect(capsule.revision).toBe(1);
      expect(capsule.labels).toHaveLength(2);
    });

    it('requires at least one label', () => {
      expect(() =>
        capsuleMatchSchema.parse({
          ...validCapsule,
          labels: [],
        }),
      ).toThrow();
    });

    it('makes errorText optional', () => {
      const capsule = capsuleMatchSchema.parse(validCapsule);
      expect(capsule.errorText).toBeUndefined();
    });

    it('makes conflicts optional', () => {
      const capsule = capsuleMatchSchema.parse(validCapsule);
      expect(capsule.conflicts).toBeUndefined();
    });

    it('validates content max 5000 chars', () => {
      expect(() =>
        capsuleMatchSchema.parse({
          ...validCapsule,
          content: 'a'.repeat(5001),
        }),
      ).toThrow();
    });

    it('validates score in 0-1 range', () => {
      expect(() =>
        capsuleMatchSchema.parse({
          ...validCapsule,
          score: 1.5,
        }),
      ).toThrow();
    });
  });

  describe('retrievalV2QuerySchema', () => {
    it('accepts seed-only query', () => {
      const query = retrievalV2QuerySchema.parse({
        seed: 'How to handle authentication errors',
      });
      expect(query.seed).toBe('How to handle authentication errors');
    });

    it('defaults maxResults to 10', () => {
      const query = retrievalV2QuerySchema.parse({
        seed: 'Test query',
      });
      expect(query.maxResults).toBe(10);
    });

    it('defaults includeSummary to false', () => {
      const query = retrievalV2QuerySchema.parse({
        seed: 'Test query',
      });
      expect(query.includeSummary).toBe(false);
    });

    it('rejects empty seed', () => {
      expect(() =>
        retrievalV2QuerySchema.parse({
          seed: '',
        }),
      ).toThrow();
    });
  });

  describe('retrievalV2ResponseSchema', () => {
    it('defaults capsules to empty array', () => {
      const response = retrievalV2ResponseSchema.parse({});
      expect(response.capsules).toEqual([]);
    });

    it('defaults profileHints to empty array', () => {
      const response = retrievalV2ResponseSchema.parse({});
      expect(response.profileHints).toEqual([]);
    });

    it('defaults summary to null', () => {
      const response = retrievalV2ResponseSchema.parse({});
      expect(response.summary).toBeNull();
    });

    it('accepts complete response', () => {
      const response = retrievalV2ResponseSchema.parse({
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-1',
            revision: 1,
            sourcePaths: ['/src/auth.ts'],
            content: 'Auth content',
            situation: 'Situation text',
            problem: 'Problem text',
            goal: 'Goal text',
            labels: ['auth'],
            scope: 'global',
            requiredLevel: 5, // securityLevelSchema is number 0-10
            score: 0.9,
            reason: 'Match reason',
          },
        ],
        profileHints: [
          {
            artifactId: 'artifact-1',
            title: 'Authentication Guide',
            slug: 'auth-guide',
            labels: ['auth'],
          },
        ],
        refinementSummary: 'Found relevant authentication patterns',
        summary: null,
      });
      expect(response.capsules).toHaveLength(1);
      expect(response.profileHints).toHaveLength(1);
    });
  });

  describe('retrievalStrategySchema', () => {
    it('accepts valid strategies (naive, local, global, hybrid, mix, auto)', () => {
      const strategies = ['naive', 'local', 'global', 'hybrid', 'mix', 'auto'] as const;
      for (const strategy of strategies) {
        expect(retrievalStrategySchema.parse(strategy)).toBe(strategy);
      }
    });

    it('rejects invalid strategy', () => {
      expect(() => retrievalStrategySchema.parse('invalid')).toThrow();
    });
  });

  describe('routingTraceSchema', () => {
    const validTrace = {
      selectedMode: 'local' as const,
      routeFamily: 'capsule' as const,
      routingReason: 'auto-goal-query' as const,
    };

    it('accepts complete trace', () => {
      const trace = routingTraceSchema.parse(validTrace);
      expect(trace.selectedMode).toBe('local');
      expect(trace.routeFamily).toBe('capsule');
      expect(trace.routingReason).toBe('auto-goal-query');
    });

    it('defaults channelsUsed to empty array', () => {
      const trace = routingTraceSchema.parse(validTrace);
      expect(trace.channelsUsed).toEqual([]);
    });

    it('defaults fallbackApplied to false', () => {
      const trace = routingTraceSchema.parse(validTrace);
      expect(trace.fallbackApplied).toBe(false);
    });

    it('makes confidenceScore nullable', () => {
      const trace = routingTraceSchema.parse({
        ...validTrace,
        confidenceScore: null,
      });
      expect(trace.confidenceScore).toBeNull();
    });

    it('requires valid routingReason', () => {
      expect(() =>
        routingTraceSchema.parse({
          ...validTrace,
          routingReason: 'invalid',
        }),
      ).toThrow();
    });
  });

  describe('retrievalMatchSchema strict mode', () => {
    const validMatch = {
      entryId: 'entry-1',
      scope: 'global',
      requiredLevel: 5,
      shortcut: 'Fix login',
      detail: 'Authentication fix details',
      labels: ['auth'],
      score: 0.85,
      reason: 'High semantic similarity',
    };

    it('rejects unknown properties', () => {
      expect(() =>
        retrievalMatchSchema.parse({
          ...validMatch,
          extraField: 'should fail',
        }),
      ).toThrow();
    });
  });

  describe('retrievalV2ResponseSchema refinementSummary optional', () => {
    it('accepts response without refinementSummary (undefined)', () => {
      const response = retrievalV2ResponseSchema.parse({});
      expect(response.refinementSummary).toBeUndefined();
    });

    it('accepts response with refinementSummary string', () => {
      const response = retrievalV2ResponseSchema.parse({
        refinementSummary: 'some summary',
      });
      expect(response.refinementSummary).toBe('some summary');
    });
  });

  describe('retrievalV2ResponseWithHintsSchema refinements', () => {
    it('rejects capsule content that looks like raw source code (import)', () => {
      expect(() =>
        retrievalV2ResponseWithHintsSchema.parse({
          capsules: [
            {
              capsuleId: 'c1',
              artifactId: 'a1',
              revision: 1,
              sourcePaths: ['/src/foo.ts'],
              content: 'import { foo } from "bar";',
              situation: 'test',
              problem: 'test',
              goal: 'test',
              labels: ['test'],
              scope: 'global',
              requiredLevel: 5,
              score: 0.9,
              reason: 'match',
            },
          ],
        }),
      ).toThrow();
    });

    it('rejects capsule content that looks like raw source code (function)', () => {
      expect(() =>
        retrievalV2ResponseWithHintsSchema.parse({
          capsules: [
            {
              capsuleId: 'c1',
              artifactId: 'a1',
              revision: 1,
              sourcePaths: ['/src/foo.ts'],
              content: 'function handleAuth(req, res) { return res.ok(); }',
              situation: 'test',
              problem: 'test',
              goal: 'test',
              labels: ['test'],
              scope: 'global',
              requiredLevel: 5,
              score: 0.9,
              reason: 'match',
            },
          ],
        }),
      ).toThrow();
    });

    it('accepts distilled capsule content (not raw code)', () => {
      const result = retrievalV2ResponseWithHintsSchema.parse({
        capsules: [
          {
            capsuleId: 'c1',
            artifactId: 'a1',
            revision: 1,
            sourcePaths: ['/src/foo.ts'],
            content: 'Use async/await for authentication callbacks to avoid race conditions',
            situation: 'User login fails intermittently',
            problem: 'Race condition in auth flow',
            goal: 'Implement proper async handling',
            labels: ['auth'],
            scope: 'global',
            requiredLevel: 5,
            score: 0.9,
            reason: 'match',
          },
        ],
      });
      expect(result.capsules).toHaveLength(1);
    });

    it('rejects script hints with executable content (shebang)', () => {
      expect(() =>
        retrievalV2ResponseWithHintsSchema.parse({
          activationHints: [
            {
              capsuleId: 'c1',
              readNext: [],
              assets: [],
              scripts: [
                {
                  artifactId: 'a1',
                  revision: 1,
                  path: '/scripts/build.sh',
                  sha256: 'a'.repeat(64),
                  capability: '#!/bin/bash\nrm -rf /',
                  argsSchemaSummary: '',
                  sideEffectSummary: '',
                  defaultPolicy: 'auto',
                },
              ],
            },
          ],
        }),
      ).toThrow();
    });

    it('accepts metadata-only script hints', () => {
      const result = retrievalV2ResponseWithHintsSchema.parse({
        activationHints: [
          {
            capsuleId: 'c1',
            readNext: [],
            assets: [],
            scripts: [
              {
                artifactId: 'a1',
                revision: 1,
                path: '/scripts/build.sh',
                sha256: 'a'.repeat(64),
                capability: 'Runs the build pipeline',
                argsSchemaSummary: 'No arguments',
                sideEffectSummary: 'Creates dist/ directory',
                defaultPolicy: 'auto',
              },
            ],
          },
        ],
      });
      expect(result.activationHints).toHaveLength(1);
    });
  });

  describe('graphPlanSearchResponseSchema strict mode', () => {
    it('rejects unknown properties', () => {
      expect(() =>
        graphPlanSearchResponseSchema.parse({
          routingTrace: {
            selectedMode: 'local',
            routeFamily: 'capsule',
            routingReason: 'v2-default-capsule',
            confidenceScore: 0.8,
            confidenceBucket: 'high',
          },
          plan: null,
          fallback: null,
          extraField: 'should fail',
        }),
      ).toThrow();
    });
  });
});
