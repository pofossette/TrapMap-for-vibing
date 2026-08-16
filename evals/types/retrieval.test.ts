/**
 * Retrieval Evaluation Contracts (REVAL-01, REVAL-02) — moved from
 * packages/contracts/src/index.test.ts (Phase 25) when eval-only contracts
 * relocated to evals/types/.
 */

import { describe, expect, it } from 'vitest';

import {
  retrievalEvalActorSchema,
  retrievalEvalCaseSchema,
  retrievalEvalEndpointSchema,
  retrievalEvalExpectedSchema,
  retrievalEvalGovernanceExpectationsSchema,
  retrievalEvalRelevanceExpectationsSchema,
  retrievalEvalRequestSchema,
  retrievalEvalScenarioSchema,
  retrievalEvalShapeExpectationsSchema,
  retrievalEvalTierSchema,
} from './retrieval.js';

describe('Phase 25: Retrieval Evaluation Contracts', () => {
  describe('retrievalEvalTierSchema', () => {
    it('accepts smoke and core tiers', () => {
      expect(retrievalEvalTierSchema.parse('smoke')).toBe('smoke');
      expect(retrievalEvalTierSchema.parse('core')).toBe('core');
    });

    it('rejects invalid tier values', () => {
      expect(() => retrievalEvalTierSchema.parse('full')).toThrow();
      expect(() => retrievalEvalTierSchema.parse('integration')).toThrow();
    });
  });

  describe('retrievalEvalEndpointSchema', () => {
    it('accepts explicit v1, v2, and v3 endpoint paths', () => {
      expect(retrievalEvalEndpointSchema.parse('/v1/retrieval/search')).toBe(
        '/v1/retrieval/search',
      );
      expect(retrievalEvalEndpointSchema.parse('/v2/retrieval/search')).toBe(
        '/v2/retrieval/search',
      );
      expect(retrievalEvalEndpointSchema.parse('/v3/retrieval/search')).toBe(
        '/v3/retrieval/search',
      );
    });

    it('rejects invalid or normalized endpoint values', () => {
      // Should reject shorthand or normalized forms
      expect(() => retrievalEvalEndpointSchema.parse('v1/retrieval/search')).toThrow();
      expect(() => retrievalEvalEndpointSchema.parse('/retrieval/search')).toThrow();
      expect(() => retrievalEvalEndpointSchema.parse('/v4/retrieval/search')).toThrow();
    });
  });

  describe('retrievalEvalActorSchema', () => {
    it('accepts valid user actor with team context', () => {
      const actor = {
        subjectType: 'user',
        activeTeamId: 'team_1',
        securityLevel: 5,
        permissions: ['knowledge:search'],
      };
      const parsed = retrievalEvalActorSchema.parse(actor);
      expect(parsed.subjectType).toBe('user');
      expect(parsed.activeTeamId).toBe('team_1');
    });

    it('accepts system-admin actor with null team', () => {
      const actor = {
        subjectType: 'system-admin',
        activeTeamId: null,
        securityLevel: 10,
        permissions: ['system:admin'],
      };
      const parsed = retrievalEvalActorSchema.parse(actor);
      expect(parsed.subjectType).toBe('system-admin');
      expect(parsed.activeTeamId).toBeNull();
    });

    it('rejects actor without permissions', () => {
      const actor = {
        subjectType: 'user',
        activeTeamId: 'team_1',
        securityLevel: 5,
        permissions: [],
      };
      expect(() => retrievalEvalActorSchema.parse(actor)).toThrow();
    });

    it('rejects actor with invalid security level', () => {
      const actor = {
        subjectType: 'user',
        activeTeamId: 'team_1',
        securityLevel: 15, // Invalid: > 10
        permissions: ['knowledge:search'],
      };
      expect(() => retrievalEvalActorSchema.parse(actor)).toThrow();
    });
  });

  describe('retrievalEvalScenarioSchema', () => {
    it('parses valid scenario with actor context and deterministic fixtures', () => {
      const scenario = {
        scenarioId: 'governance-mixed-entries',
        description: 'Mix of approved, pending, and cross-team entries',
        actor: {
          subjectType: 'user',
          activeTeamId: 'team_1',
          securityLevel: 5,
          permissions: ['knowledge:search'],
        },
        fixtures: {
          knowledgeEntries: [{ id: 'entry_1', scope: 'global', lifecycleState: 'approved' }],
          skillArtifacts: [],
        },
      };
      const parsed = retrievalEvalScenarioSchema.parse(scenario);
      expect(parsed.scenarioId).toBe('governance-mixed-entries');
      expect(parsed.actor.securityLevel).toBe(5);
    });

    it('defaults empty fixture arrays', () => {
      const scenario = {
        scenarioId: 'empty-corpus',
        description: 'Empty corpus scenario',
        actor: {
          subjectType: 'user',
          activeTeamId: null,
          securityLevel: 0,
          permissions: ['knowledge:search'],
        },
        fixtures: {}, // Omit fixtures
      };
      const parsed = retrievalEvalScenarioSchema.parse(scenario);
      expect(parsed.fixtures.knowledgeEntries).toEqual([]);
      expect(parsed.fixtures.skillArtifacts).toEqual([]);
    });

    it('accepts retrieval db snapshot metadata alongside fixtures', () => {
      const scenario = {
        scenarioId: 'live-corpus-snapshot',
        description: 'Scenario restored from a captured retrieval database snapshot',
        actor: {
          subjectType: 'user',
          activeTeamId: 'team_live',
          securityLevel: 4,
          permissions: ['knowledge:search'],
        },
        snapshot: {
          kind: 'retrieval-db-snapshot',
          path: 'evals/retrieval/snapshots/team-live.json',
        },
        fixtures: {},
      };

      const parsed = retrievalEvalScenarioSchema.parse(scenario);
      expect(parsed.snapshot?.kind).toBe('retrieval-db-snapshot');
      expect(parsed.snapshot?.path).toContain('team-live.json');
      expect(parsed.fixtures.graphIndexDocuments).toEqual([]);
    });
  });

  describe('retrievalEvalRequestSchema', () => {
    it('accepts seed-only request with defaults', () => {
      const request = { seed: 'REST API rate limiting' };
      const parsed = retrievalEvalRequestSchema.parse(request);
      expect(parsed.seed).toBe('REST API rate limiting');
      expect(parsed.filters.labels).toEqual([]);
      expect(parsed.filters.scopes).toEqual([]);
    });

    it('accepts request with filters and mode', () => {
      const request = {
        seed: 'docker timeout',
        filters: { labels: ['docker'], scopes: ['project'] },
        maxResults: 20,
        mode: 'hybrid',
      };
      const parsed = retrievalEvalRequestSchema.parse(request);
      expect(parsed.mode).toBe('hybrid');
      expect(parsed.maxResults).toBe(20);
    });
  });

  describe('retrievalEvalRelevanceExpectationsSchema', () => {
    it('accepts relevant IDs and ideal order for ranking metrics', () => {
      const relevance = {
        relevantIds: ['entry_1', 'entry_2', 'entry_3'],
        idealOrder: ['entry_2', 'entry_1', 'entry_3'],
      };
      const parsed = retrievalEvalRelevanceExpectationsSchema.parse(relevance);
      expect(parsed.relevantIds).toHaveLength(3);
      expect(parsed.idealOrder[0]).toBe('entry_2');
    });

    it('defaults empty arrays', () => {
      const parsed = retrievalEvalRelevanceExpectationsSchema.parse({});
      expect(parsed.relevantIds).toEqual([]);
      expect(parsed.idealOrder).toEqual([]);
    });
  });

  describe('retrievalEvalGovernanceExpectationsSchema', () => {
    it('accepts forbidden IDs with explicit reasons', () => {
      const governance = {
        forbiddenIds: ['entry_other_team', 'entry_high_level', 'entry_pending'],
        forbiddenReasons: ['cross-team', 'security-level', 'lifecycle'],
      };
      const parsed = retrievalEvalGovernanceExpectationsSchema.parse(governance);
      expect(parsed.forbiddenIds).toHaveLength(3);
      expect(parsed.forbiddenReasons).toContain('cross-team');
    });

    it('rejects invalid forbidden reasons', () => {
      const governance = {
        forbiddenIds: ['entry_1'],
        forbiddenReasons: ['not-authorized'], // Invalid reason
      };
      expect(() => retrievalEvalGovernanceExpectationsSchema.parse(governance)).toThrow();
    });

    it('defaults empty arrays', () => {
      const parsed = retrievalEvalGovernanceExpectationsSchema.parse({});
      expect(parsed.forbiddenIds).toEqual([]);
      expect(parsed.forbiddenReasons).toEqual([]);
    });
  });

  describe('retrievalEvalShapeExpectationsSchema', () => {
    it('accepts v1 bucket expectations', () => {
      const shape = {
        bucketExpectations: {
          globalConstraints: ['entry_1', 'entry_2'],
          projectKnowledge: ['entry_3'],
        },
      };
      const parsed = retrievalEvalShapeExpectationsSchema.parse(shape);
      expect(parsed.bucketExpectations?.globalConstraints).toHaveLength(2);
      expect(parsed.bucketExpectations?.projectKnowledge).toHaveLength(1);
    });

    it('accepts v2 profile hint and capsule expectations', () => {
      const shape = {
        expectedProfileHintArtifactIds: ['artifact_1', 'artifact_2'],
        expectedCapsuleCount: 5,
      };
      const parsed = retrievalEvalShapeExpectationsSchema.parse(shape);
      expect(parsed.expectedProfileHintArtifactIds).toHaveLength(2);
      expect(parsed.expectedCapsuleCount).toBe(5);
    });

    it('rejects invalid bucket names', () => {
      const shape = {
        bucketExpectations: {
          capsules: ['capsule_1'], // Invalid: v2 concept in v1 bucket shape
        },
      };
      expect(() => retrievalEvalShapeExpectationsSchema.parse(shape)).toThrow();
    });
  });

  describe('retrievalEvalExpectedSchema', () => {
    it('accepts non-empty outcome with relevance and governance', () => {
      const expected = {
        outcome: 'non-empty',
        relevance: { relevantIds: ['entry_1'] },
        governance: { forbiddenIds: [] },
        shape: {},
      };
      const parsed = retrievalEvalExpectedSchema.parse(expected);
      expect(parsed.outcome).toBe('non-empty');
    });

    it('accepts empty outcome for forbidden-result scenarios', () => {
      const expected = {
        outcome: 'empty',
        relevance: { relevantIds: [] },
        governance: {
          forbiddenIds: ['entry_other_team'],
          forbiddenReasons: ['cross-team'],
        },
      };
      const parsed = retrievalEvalExpectedSchema.parse(expected);
      expect(parsed.outcome).toBe('empty');
      expect(parsed.governance.forbiddenReasons).toContain('cross-team');
    });

    it('defaults shape expectations', () => {
      const expected = {
        outcome: 'non-empty',
        relevance: {},
        governance: {},
      };
      const parsed = retrievalEvalExpectedSchema.parse(expected);
      expect(parsed.shape.expectedProfileHintArtifactIds).toEqual([]);
    });
  });

  describe('retrievalEvalCaseSchema', () => {
    it('parses valid v1 smoke case with bucket expectations (Task 1, Test 2)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'v1-semantic-positive-smoke',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'docker timeout', mode: 'semantic' },
        scenarioId: 'docker-basics',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: ['entry_1'] },
          governance: { forbiddenIds: [] },
          shape: {
            bucketExpectations: {
              globalConstraints: [],
              projectKnowledge: ['entry_1'],
            },
          },
        },
        tags: ['v1', 'smoke', 'positive'],
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      expect(parsed.caseId).toBe('v1-semantic-positive-smoke');
      expect(parsed.endpoint).toBe('/v1/retrieval/search');
      expect(parsed.expected.shape.bucketExpectations?.projectKnowledge).toContain('entry_1');
    });

    it('parses valid v2 smoke case with capsule/profile expectations (Task 1, Test 3)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'v2-capsule-positive-smoke',
        tier: 'smoke',
        endpoint: '/v2/retrieval/search',
        request: { seed: 'docker deployment' },
        scenarioId: 'docker-basics',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: ['capsule_1'], idealOrder: ['capsule_1'] },
          governance: { forbiddenIds: [] },
          shape: {
            expectedProfileHintArtifactIds: ['artifact_1'],
            expectedCapsuleCount: 1,
          },
        },
        tags: ['v2', 'smoke', 'capsule'],
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      expect(parsed.endpoint).toBe('/v2/retrieval/search');
      expect(parsed.expected.shape.expectedProfileHintArtifactIds).toContain('artifact_1');
      expect(parsed.expected.shape.expectedCapsuleCount).toBe(1);
    });

    it('keeps relevance and governance separate (T-25-02)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'v1-semantic-forbidden-smoke',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'internal secrets' },
        scenarioId: 'governance-mixed',
        expected: {
          outcome: 'empty',
          relevance: { relevantIds: ['entry_sensitive'] }, // Would be relevant
          governance: {
            forbiddenIds: ['entry_sensitive'], // But is forbidden
            forbiddenReasons: ['security-level'],
          },
        },
        tags: ['governance', 'smoke'],
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      // Relevance and governance are independent
      expect(parsed.expected.relevance.relevantIds).toContain('entry_sensitive');
      expect(parsed.expected.governance.forbiddenIds).toContain('entry_sensitive');
    });

    it('accepts valid v3 endpoint values (Task 1, Test 4)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'valid-v3-endpoint',
        tier: 'smoke',
        endpoint: '/v3/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: { outcome: 'non-empty', relevance: {}, governance: {} },
      };
      expect(retrievalEvalCaseSchema.parse(testCase).endpoint).toBe('/v3/retrieval/search');
    });

    it('rejects missing actor/security fields (Task 1, Test 4)', () => {
      const scenario = {
        scenarioId: 'missing-actor',
        description: 'Invalid scenario',
        actor: {
          subjectType: 'user',
          // Missing activeTeamId and securityLevel
          permissions: ['knowledge:search'],
        },
        fixtures: {},
      };
      expect(() => retrievalEvalScenarioSchema.parse(scenario)).toThrow();
    });

    it('rejects mixed v1/v2 shape assertions (Task 1, Test 4)', () => {
      // This validates that v1 bucket names are explicitly constrained
      const shape = {
        bucketExpectations: {
          capsules: ['capsule_1'], // Invalid: v2 concept in v1 bucket shape
        },
      };
      expect(() => retrievalEvalShapeExpectationsSchema.parse(shape)).toThrow();
    });

    it('rejects collapsed expectedIds shortcut (Task 1, Test 4)', () => {
      // The schema does not have an expectedIds field at the case level
      // This test documents that collapsed shortcuts are not supported
      const testCase = {
        schemaVersion: 1,
        caseId: 'collapsed-test',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: {
          outcome: 'non-empty',
          expectedIds: ['entry_1'], // Invalid: collapsed shortcut not supported
        },
      };
      expect(() => retrievalEvalCaseSchema.parse(testCase)).toThrow();
    });

    it('requires schema version field', () => {
      const testCase = {
        // Missing schemaVersion
        caseId: 'no-version',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: { outcome: 'non-empty', relevance: {}, governance: {} },
      };
      expect(() => retrievalEvalCaseSchema.parse(testCase)).toThrow();
    });

    it('defaults tags to empty array', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'no-tags',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: { outcome: 'non-empty', relevance: {}, governance: {} },
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      expect(parsed.tags).toEqual([]);
    });
  });
});
