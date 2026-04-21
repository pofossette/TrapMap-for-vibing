/**
 * Tests for retrieval evaluation runner.
 *
 * Task 1: Test execution through explicit adapters, maintainer scripts, and predictable output.
 *
 * Phase 26-01: REVAL-01
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RetrievalEvalCase } from '../../../packages/contracts/src/index.js';
import {
  closeExecutionContext,
  createExecutionContext,
  executeCase,
} from './lib/adapters.js';
import { loadCases, filterByEndpoint } from './lib/load.js';
import { evaluateGovernance } from './lib/governance.js';
import { calculateMetrics } from './lib/metrics.js';

describe('retrieval runner', () => {
  describe('case loading', () => {
    it('loads smoke tier cases successfully', () => {
      const cases = loadCases('smoke');

      expect(cases.length).toBeGreaterThan(0);
    });

    it('loads core tier cases successfully', () => {
      const cases = loadCases('core');

      expect(cases.length).toBeGreaterThan(0);
    });

    it('validates cases against schema', () => {
      const smokeCases = loadCases('smoke');

      for (const case_ of smokeCases) {
        expect(case_.schemaVersion).toBe(1);
        expect(case_.caseId).toBeDefined();
        expect(case_.endpoint).toBeDefined();
        expect(case_.request.seed).toBeDefined();
      }
    });

    it('filters cases by endpoint', () => {
      const cases = loadCases('smoke');
      const v1Cases = filterByEndpoint(cases, '/v1/retrieval/search');
      const v2Cases = filterByEndpoint(cases, '/v2/retrieval/search');

      expect(v1Cases.every((c) => c.endpoint === '/v1/retrieval/search')).toBe(true);
      expect(v2Cases.every((c) => c.endpoint === '/v2/retrieval/search')).toBe(true);
    });
  });

  describe('execution context', () => {
    it('creates execution context with app and store', async () => {
      const ctx = await createExecutionContext();

      expect(ctx.app).toBeDefined();
      expect(ctx.store).toBeDefined();
      expect(ctx.sessionToken).toBeDefined();

      await closeExecutionContext(ctx);
    });

    it('session token authenticates successfully', async () => {
      const ctx = await createExecutionContext();

      const response = await ctx.app.inject({
        method: 'GET',
        url: '/v1/auth/session',
        headers: {
          authorization: `Bearer ${ctx.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      await closeExecutionContext(ctx);
    });
  });

  describe('endpoint execution', () => {
    let ctx: Awaited<ReturnType<typeof createExecutionContext>>;

    beforeEach(async () => {
      ctx = await createExecutionContext();
    });

    afterEach(async () => {
      if (ctx) {
        await closeExecutionContext(ctx);
      }
    });

    it('executes v1 endpoint and returns adapter result', async () => {
      const cases = loadCases('smoke');
      const v1Case = cases.find((c) => c.endpoint === '/v1/retrieval/search');

      if (!v1Case) {
        // Skip if no v1 case exists
        return;
      }

      const result = await executeCase(ctx, v1Case);

      expect(result.result).toBeDefined();
      expect(result.execution).toBeDefined();
      expect(result.execution.endpoint).toBe('/v1/retrieval/search');
      expect(result.execution.adapterType).toBe('route');
    });

    it('executes v2 endpoint and returns adapter result', async () => {
      const cases = loadCases('smoke');
      const v2Case = cases.find((c) => c.endpoint === '/v2/retrieval/search');

      if (!v2Case) {
        // Skip if no v2 case exists
        return;
      }

      const result = await executeCase(ctx, v2Case);

      expect(result.result).toBeDefined();
      expect(result.execution).toBeDefined();
      expect(result.execution.endpoint).toBe('/v2/retrieval/search');
      expect(result.execution.adapterType).toBe('route');
    });

    it('records execution metadata', async () => {
      const cases = loadCases('smoke');
      const testCase = cases[0];

      if (!testCase) {
        return;
      }

      const result = await executeCase(ctx, testCase);

      expect(result.execution.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.execution.fallbackUsed).toBeDefined();
    });
  });

  describe('governance evaluation', () => {
    it('detects forbidden hits', () => {
      const testCase: RetrievalEvalCase = {
        schemaVersion: 1,
        caseId: 'test-forbidden',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: [], idealOrder: [] },
          governance: {
            forbiddenIds: ['forbidden_1', 'forbidden_2'],
            forbiddenReasons: ['cross-team'],
          },
          shape: {},
        },
        tags: [],
      };

      const result = {
        hits: [
          { id: 'allowed_1', score: 0.9, reason: 'match', scope: 'project' as const },
          { id: 'forbidden_1', score: 0.8, reason: 'match', scope: 'project' as const },
        ],
        returnedIds: ['allowed_1', 'forbidden_1'],
        buckets: { globalConstraints: [], projectKnowledge: ['allowed_1', 'forbidden_1'] },
        profileHintArtifactIds: [],
        isEmpty: false,
        rawResponse: {},
        endpoint: '/v1/retrieval/search' as const,
      };

      const gov = evaluateGovernance(testCase, result);

      expect(gov.passed).toBe(false);
      expect(gov.failures).toHaveLength(1);
      expect(gov.failures[0]?.kind).toBe('forbidden-hit');
      expect(gov.forbiddenHits).toContain('forbidden_1');
    });

    it('detects unexpected empty result', () => {
      const testCase: RetrievalEvalCase = {
        schemaVersion: 1,
        caseId: 'test-unexpected-empty',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: ['expected_1'], idealOrder: ['expected_1'] },
          governance: { forbiddenIds: [], forbiddenReasons: [] },
          shape: {},
        },
        tags: [],
      };

      const result = {
        hits: [],
        returnedIds: [],
        buckets: { globalConstraints: [], projectKnowledge: [] },
        profileHintArtifactIds: [],
        isEmpty: true,
        rawResponse: {},
        endpoint: '/v1/retrieval/search' as const,
      };

      const gov = evaluateGovernance(testCase, result);

      expect(gov.passed).toBe(false);
      expect(gov.failures.some((f) => f.kind === 'unexpected-empty')).toBe(true);
    });

    it('passes when all expectations are met', () => {
      const testCase: RetrievalEvalCase = {
        schemaVersion: 1,
        caseId: 'test-pass',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: ['expected_1'], idealOrder: ['expected_1'] },
          governance: { forbiddenIds: [], forbiddenReasons: [] },
          shape: {},
        },
        tags: [],
      };

      const result = {
        hits: [
          { id: 'expected_1', score: 0.9, reason: 'match', scope: 'project' as const },
        ],
        returnedIds: ['expected_1'],
        buckets: { globalConstraints: [], projectKnowledge: ['expected_1'] },
        profileHintArtifactIds: [],
        isEmpty: false,
        rawResponse: {},
        endpoint: '/v1/retrieval/search' as const,
      };

      const gov = evaluateGovernance(testCase, result);

      expect(gov.passed).toBe(true);
      expect(gov.failures).toHaveLength(0);
    });
  });

  describe('metrics calculation', () => {
    it('calculates metrics from normalized result', () => {
      const result = {
        hits: [
          { id: 'id_1', score: 0.9, reason: 'match', scope: 'project' as const },
          { id: 'id_2', score: 0.8, reason: 'match', scope: 'project' as const },
        ],
        returnedIds: ['id_1', 'id_2'],
        buckets: { globalConstraints: [], projectKnowledge: ['id_1', 'id_2'] },
        profileHintArtifactIds: [],
        isEmpty: false,
        rawResponse: {},
        endpoint: '/v1/retrieval/search' as const,
      };

      const metrics = calculateMetrics(result, ['id_1', 'id_2'], ['id_1', 'id_2']);

      expect(metrics.hitAt1).toBe(1);
      expect(metrics.mrr).toBe(1);
      expect(metrics.ndcg).toBe(1);
    });
  });
});
