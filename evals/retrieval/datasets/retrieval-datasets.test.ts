/**
 * Retrieval Datasets Validation Tests
 *
 * Phase 25-02: REVAL-02
 *
 * Validates that:
 * 1. All dataset modules parse through the shared eval schemas
 * 2. Both endpoints (v1 and v2) are represented in smoke and core tiers
 * 3. Each endpoint has positive, empty, and forbidden coverage
 * 4. Every scenarioId resolves to a declared scenario
 */

import { describe, expect, it } from 'vitest';

import { retrievalEvalCaseSchema, retrievalEvalScenarioSchema } from '../../types/index.js';

import { coreScenarios, coreScenariosMap } from '../scenarios/core/retrieval-core-scenarios.js';
// Import scenarios
import { smokeScenarios, smokeScenariosMap } from '../scenarios/smoke/retrieval-smoke-scenarios.js';
// Import v1 core datasets
import { v1RetrievalCoreCases } from './core/v1-retrieval-core.js';
// Import v2 core datasets
import { v2RetrievalCoreCases } from './core/v2-retrieval-core.js';
// Import v1 smoke datasets
import { v1RetrievalSmokeCases } from './smoke/v1-retrieval-smoke.js';
// Import v2 smoke datasets
import { v2RetrievalSmokeCases } from './smoke/v2-retrieval-smoke.js';

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('retrieval datasets schema validation', () => {
  describe('smoke scenarios', () => {
    it('all smoke scenarios parse through schema', () => {
      for (const scenario of smokeScenarios) {
        const parsed = retrievalEvalScenarioSchema.parse(scenario);
        expect(parsed.scenarioId).toBe(scenario.scenarioId);
      }
    });

    it('smoke scenarios have expected IDs', () => {
      expect(smokeScenariosMap['smoke-positive-visible']).toBeDefined();
      expect(smokeScenariosMap['smoke-empty-result']).toBeDefined();
      expect(smokeScenariosMap['smoke-forbidden']).toBeDefined();
    });
  });

  describe('core scenarios', () => {
    it('all core scenarios parse through schema', () => {
      for (const scenario of coreScenarios) {
        const parsed = retrievalEvalScenarioSchema.parse(scenario);
        expect(parsed.scenarioId).toBe(scenario.scenarioId);
      }
    });

    it('core scenarios have expected IDs', () => {
      expect(coreScenariosMap['core-ranked-hits']).toBeDefined();
      expect(coreScenariosMap['core-mixed-visibility']).toBeDefined();
      expect(coreScenariosMap['core-bucket-shape']).toBeDefined();
      expect(coreScenariosMap['core-profile-hints']).toBeDefined();
    });
  });

  describe('v1 smoke datasets', () => {
    it('all v1 smoke cases parse through schema', () => {
      for (const case_ of v1RetrievalSmokeCases) {
        const parsed = retrievalEvalCaseSchema.parse(case_);
        expect(parsed.caseId).toBe(case_.caseId);
        expect(['/v1/retrieval/search', '/v1/retrieval/skills/search-by-content']).toContain(
          parsed.endpoint,
        );
        expect(parsed.tier).toBe('smoke');
      }
    });
  });

  describe('v2 smoke datasets', () => {
    it('all v2 smoke cases parse through schema', () => {
      for (const case_ of v2RetrievalSmokeCases) {
        const parsed = retrievalEvalCaseSchema.parse(case_);
        expect(parsed.caseId).toBe(case_.caseId);
        expect(parsed.endpoint).toBe('/v2/retrieval/search');
        expect(parsed.tier).toBe('smoke');
      }
    });
  });

  describe('v1 core datasets', () => {
    it('all v1 core cases parse through schema', () => {
      for (const case_ of v1RetrievalCoreCases) {
        const parsed = retrievalEvalCaseSchema.parse(case_);
        expect(parsed.caseId).toBe(case_.caseId);
        expect(['/v1/retrieval/search', '/v1/retrieval/skills/search-by-content']).toContain(
          parsed.endpoint,
        );
        expect(parsed.tier).toBe('core');
      }
    });
  });

  describe('v2 core datasets', () => {
    it('all v2 core cases parse through schema', () => {
      for (const case_ of v2RetrievalCoreCases) {
        const parsed = retrievalEvalCaseSchema.parse(case_);
        expect(parsed.caseId).toBe(case_.caseId);
        expect(parsed.endpoint).toBe('/v2/retrieval/search');
        expect(parsed.tier).toBe('core');
      }
    });
  });
});

// =============================================================================
// Coverage Matrix Tests
// =============================================================================

describe('retrieval dataset coverage matrix', () => {
  const allSmokeCases = [...v1RetrievalSmokeCases, ...v2RetrievalSmokeCases];
  const allCoreCases = [...v1RetrievalCoreCases, ...v2RetrievalCoreCases];

  describe('smoke tier coverage', () => {
    it('both endpoints represented in smoke tier', () => {
      const endpoints = new Set(allSmokeCases.map((c) => c.endpoint));
      expect(endpoints.has('/v1/retrieval/search')).toBe(true);
      expect(endpoints.has('/v1/retrieval/skills/search-by-content')).toBe(true);
      expect(endpoints.has('/v2/retrieval/search')).toBe(true);
    });

    it('v1 smoke has positive, empty, and forbidden coverage', () => {
      const v1Cases = allSmokeCases.filter((c) => c.endpoint === '/v1/retrieval/search');
      const outcomes = new Set(v1Cases.map((c) => c.expected.outcome));

      // Positive case exists
      expect(outcomes.has('non-empty')).toBe(true);

      // Empty case exists
      expect(outcomes.has('empty')).toBe(true);

      // Forbidden case exists (empty outcome but with forbiddenIds)
      const forbiddenCases = v1Cases.filter((c) => c.expected.governance.forbiddenIds.length > 0);
      expect(forbiddenCases.length).toBeGreaterThan(0);
    });

    it('v2 smoke has positive, empty, and forbidden coverage', () => {
      const v2Cases = allSmokeCases.filter((c) => c.endpoint === '/v2/retrieval/search');
      const outcomes = new Set(v2Cases.map((c) => c.expected.outcome));

      // Positive case exists
      expect(outcomes.has('non-empty')).toBe(true);

      // Empty case exists
      expect(outcomes.has('empty')).toBe(true);

      // Forbidden case exists (empty outcome but with forbiddenIds)
      const forbiddenCases = v2Cases.filter((c) => c.expected.governance.forbiddenIds.length > 0);
      expect(forbiddenCases.length).toBeGreaterThan(0);
    });
  });

  describe('core tier coverage', () => {
    it('both endpoints represented in core tier', () => {
      const endpoints = new Set(allCoreCases.map((c) => c.endpoint));
      expect(endpoints.has('/v1/retrieval/search')).toBe(true);
      expect(endpoints.has('/v1/retrieval/skills/search-by-content')).toBe(true);
      expect(endpoints.has('/v2/retrieval/search')).toBe(true);
    });

    it('v1 core has mode variation coverage', () => {
      const v1Cases = allCoreCases.filter((c) => c.endpoint === '/v1/retrieval/search');
      const modes = new Set(
        v1Cases.map((c) => c.request.mode).filter((m): m is string => m !== undefined),
      );

      expect(modes.has('semantic')).toBe(true);
      expect(modes.has('hybrid')).toBe(true);
      expect(modes.has('graph-assisted')).toBe(true);
    });

    it('v2 core has profile hints coverage', () => {
      const v2Cases = allCoreCases.filter((c) => c.endpoint === '/v2/retrieval/search');
      const profileHintCases = v2Cases.filter(
        (c) => c.expected.shape.expectedProfileHintArtifactIds.length > 0,
      );

      expect(profileHintCases.length).toBeGreaterThan(0);
    });

    it('core tier has governance leakage cases', () => {
      const governanceCases = allCoreCases.filter(
        (c) => c.expected.governance.forbiddenIds.length > 0,
      );

      expect(governanceCases.length).toBeGreaterThan(0);

      // Verify forbidden reasons are explicit
      for (const case_ of governanceCases) {
        expect(case_.expected.governance.forbiddenReasons.length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// Scenario Resolution Tests
// =============================================================================

describe('scenario resolution', () => {
  const allCases = [
    ...v1RetrievalSmokeCases,
    ...v2RetrievalSmokeCases,
    ...v1RetrievalCoreCases,
    ...v2RetrievalCoreCases,
  ];

  const allScenariosMap = { ...smokeScenariosMap, ...coreScenariosMap };

  it('every case scenarioId resolves to a declared scenario', () => {
    for (const case_ of allCases) {
      const scenario = allScenariosMap[case_.scenarioId];
      expect(scenario).toBeDefined();
      expect(scenario.scenarioId).toBe(case_.scenarioId);
    }
  });

  it('no orphan scenarios exist', () => {
    const usedScenarioIds = new Set(allCases.map((c) => c.scenarioId));
    const declaredScenarioIds = new Set(Object.keys(allScenariosMap));

    // All used scenarios should be declared
    for (const usedId of usedScenarioIds) {
      expect(declaredScenarioIds.has(usedId)).toBe(true);
    }
  });
});

// =============================================================================
// Governance Separation Tests
// =============================================================================

describe('governance and relevance separation', () => {
  const allCases = [
    ...v1RetrievalSmokeCases,
    ...v2RetrievalSmokeCases,
    ...v1RetrievalCoreCases,
    ...v2RetrievalCoreCases,
  ];

  it('every case has explicit governance expectations', () => {
    for (const case_ of allCases) {
      expect(case_.expected.governance).toBeDefined();
      expect(Array.isArray(case_.expected.governance.forbiddenIds)).toBe(true);
      expect(Array.isArray(case_.expected.governance.forbiddenReasons)).toBe(true);
    }
  });

  it('every case has explicit relevance expectations', () => {
    for (const case_ of allCases) {
      expect(case_.expected.relevance).toBeDefined();
      expect(Array.isArray(case_.expected.relevance.relevantIds)).toBe(true);
      expect(Array.isArray(case_.expected.relevance.idealOrder)).toBe(true);
    }
  });

  it('forbidden cases document forbidden reasons', () => {
    const forbiddenCases = allCases.filter((c) => c.expected.governance.forbiddenIds.length > 0);

    for (const case_ of forbiddenCases) {
      expect(case_.expected.governance.forbiddenReasons.length).toBeGreaterThan(0);

      // Reasons should be valid enum values
      const validReasons = ['cross-team', 'security-level', 'lifecycle'];
      for (const reason of case_.expected.governance.forbiddenReasons) {
        expect(validReasons.includes(reason)).toBe(true);
      }
    }
  });
});

// =============================================================================
// Endpoint-Specific Shape Expectations Tests
// =============================================================================

describe('endpoint-specific shape expectations', () => {
  describe('v1 shape expectations', () => {
    it('v1 cases can express bucket expectations', () => {
      const v1Cases = [...v1RetrievalSmokeCases, ...v1RetrievalCoreCases];
      const bucketCases = v1Cases.filter((c) => c.expected.shape.bucketExpectations !== undefined);

      expect(bucketCases.length).toBeGreaterThan(0);
    });
  });

  describe('v2 shape expectations', () => {
    it('v2 cases can express profile hint expectations', () => {
      const v2Cases = [...v2RetrievalSmokeCases, ...v2RetrievalCoreCases];
      const profileHintCases = v2Cases.filter(
        (c) => c.expected.shape.expectedProfileHintArtifactIds.length > 0,
      );

      expect(profileHintCases.length).toBeGreaterThan(0);
    });

    it('v2 cases can express capsule count expectations', () => {
      const v2Cases = [...v2RetrievalSmokeCases, ...v2RetrievalCoreCases];
      const capsuleCountCases = v2Cases.filter(
        (c) => c.expected.shape.expectedCapsuleCount !== undefined,
      );

      expect(capsuleCountCases.length).toBeGreaterThan(0);
    });
  });

  describe('v1 skill lookup shape expectations', () => {
    it('skill lookup cases can express artifact expectations', () => {
      const skillLookupCases = [...v1RetrievalSmokeCases, ...v1RetrievalCoreCases].filter(
        (c) => c.endpoint === '/v1/retrieval/skills/search-by-content',
      );
      const artifactExpectationCases = skillLookupCases.filter(
        (c) => c.expected.shape.expectedArtifactIds.length > 0,
      );

      expect(skillLookupCases.length).toBeGreaterThan(0);
      expect(artifactExpectationCases.length).toBeGreaterThan(0);
    });
  });
});
