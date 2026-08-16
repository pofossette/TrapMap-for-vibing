/**
 * Tests for governance assertions.
 *
 * Phase 26-02: REVAL-04
 * Tests for forbidden-result leakage, unexpected emptiness, scope/shape mismatches.
 * Governance verdicts remain separate from ranking metric summaries.
 */

import { describe, expect, it } from 'vitest';

import type { RetrievalEvalCase } from '../../types/index.js';
import {
  evaluateVerdicts,
  extractGovernanceFailures,
  hasExecutionIssue,
  hasGovernanceFailure,
  hasOutcomeMismatch,
} from './assertions.js';
import type { AdapterWarning, NormalizedResult } from './types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const makeTestCase = (overrides: Partial<RetrievalEvalCase> = {}): RetrievalEvalCase => ({
  schemaVersion: 1,
  caseId: 'test-case',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: { seed: 'test' },
  scenarioId: 'test-scenario',
  expected: {
    outcome: 'non-empty',
    relevance: { relevantIds: [], idealOrder: [] },
    governance: { forbiddenIds: [], forbiddenReasons: [] },
    shape: {},
  },
  tags: [],
  ...overrides,
});

const makeResult = (overrides: Partial<NormalizedResult> = {}): NormalizedResult => ({
  hits: [],
  returnedIds: [],
  buckets: { globalConstraints: [], projectKnowledge: [] },
  profileHintArtifactIds: [],
  isEmpty: true,
  rawResponse: {},
  endpoint: '/v1/retrieval/search',
  ...overrides,
});

// =============================================================================
// Tests: Forbidden Hit Detection
// =============================================================================

describe('forbidden hit detection', () => {
  it('detects forbidden-result leakage as governance failure', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['allowed_1'], idealOrder: [] },
        governance: {
          forbiddenIds: ['forbidden_1', 'forbidden_2'],
          forbiddenReasons: ['cross-team'],
        },
        shape: {},
      },
    });

    const result = makeResult({
      hits: [
        { id: 'allowed_1', score: 0.9, reason: 'match', scope: 'project' },
        { id: 'forbidden_1', score: 0.8, reason: 'match', scope: 'project' },
      ],
      returnedIds: ['allowed_1', 'forbidden_1'],
      isEmpty: false,
      buckets: {
        globalConstraints: [],
        projectKnowledge: ['allowed_1', 'forbidden_1'],
      },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasGovernanceFailure(verdicts)).toBe(true);

    const failures = extractGovernanceFailures(verdicts);
    expect(failures.some((f) => f.kind === 'forbidden-hit')).toBe(true);
    expect(failures.find((f) => f.kind === 'forbidden-hit')?.ids).toContain('forbidden_1');
  });

  it('passes when no forbidden IDs appear in results', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['allowed_1'], idealOrder: [] },
        governance: {
          forbiddenIds: ['forbidden_1'],
          forbiddenReasons: ['cross-team'],
        },
        shape: {},
      },
    });

    const result = makeResult({
      hits: [{ id: 'allowed_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['allowed_1'],
      isEmpty: false,
      buckets: {
        globalConstraints: [],
        projectKnowledge: ['allowed_1'],
      },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(true);
    expect(hasGovernanceFailure(verdicts)).toBe(false);
  });
});

// =============================================================================
// Tests: Outcome Expectations
// =============================================================================

describe('outcome expectations', () => {
  it('detects unexpected empty result', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['expected_1'], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    const result = makeResult({ isEmpty: true });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasOutcomeMismatch(verdicts)).toBe(true);
    expect(verdicts.outcome.matched).toBe(false);
    expect(verdicts.outcome.expected).toBe('non-empty');
    expect(verdicts.outcome.actual).toBe('empty');
  });

  it('detects unexpected non-empty result', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'empty',
        relevance: { relevantIds: [], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    const result = makeResult({
      hits: [{ id: 'unexpected_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['unexpected_1'],
      isEmpty: false,
      buckets: { globalConstraints: [], projectKnowledge: ['unexpected_1'] },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasOutcomeMismatch(verdicts)).toBe(true);
    expect(verdicts.outcome.expected).toBe('empty');
    expect(verdicts.outcome.actual).toBe('non-empty');
  });

  it('passes when outcome matches expectation', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['expected_1'], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    const result = makeResult({
      hits: [{ id: 'expected_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['expected_1'],
      isEmpty: false,
      buckets: { globalConstraints: [], projectKnowledge: ['expected_1'] },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.outcome.matched).toBe(true);
    expect(hasOutcomeMismatch(verdicts)).toBe(false);
  });
});

// =============================================================================
// Tests: Shape Mismatches
// =============================================================================

describe('shape mismatches', () => {
  it('detects v1 bucket shape mismatch', () => {
    const testCase = makeTestCase({
      endpoint: '/v1/retrieval/search',
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['entry_1'], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {
          bucketExpectations: {
            globalConstraints: ['global_1'],
            projectKnowledge: ['project_1'],
          },
        },
      },
    });

    const result = makeResult({
      endpoint: '/v1/retrieval/search',
      hits: [{ id: 'entry_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['entry_1'],
      isEmpty: false,
      buckets: {
        globalConstraints: [], // Missing 'global_1'
        projectKnowledge: ['project_1'],
      },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasGovernanceFailure(verdicts)).toBe(true);

    const failures = extractGovernanceFailures(verdicts);
    expect(failures.some((f) => f.kind === 'shape-mismatch')).toBe(true);
  });

  it('detects v2 profile hints mismatch', () => {
    const testCase = makeTestCase({
      endpoint: '/v2/retrieval/search',
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['capsule_1'], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {
          expectedProfileHintArtifactIds: ['artifact_1', 'artifact_2'],
        },
      },
    });

    const result = makeResult({
      endpoint: '/v2/retrieval/search',
      hits: [{ id: 'capsule_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['capsule_1'],
      isEmpty: false,
      profileHintArtifactIds: ['artifact_1'], // Missing 'artifact_2'
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasGovernanceFailure(verdicts)).toBe(true);
  });

  it('detects v2 capsule count mismatch', () => {
    const testCase = makeTestCase({
      endpoint: '/v2/retrieval/search',
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['capsule_1', 'capsule_2'], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {
          expectedCapsuleCount: 2,
        },
      },
    });

    const result = makeResult({
      endpoint: '/v2/retrieval/search',
      hits: [{ id: 'capsule_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['capsule_1'],
      isEmpty: false,
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasGovernanceFailure(verdicts)).toBe(true);
  });

  it('detects v1 skill lookup artifact mismatch', () => {
    const testCase = makeTestCase({
      endpoint: '/v1/retrieval/skills/search-by-content',
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['artifact_1'], idealOrder: ['artifact_1'] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {
          expectedArtifactIds: ['artifact_1', 'artifact_2'],
        },
      },
    });

    const result = makeResult({
      endpoint: '/v1/retrieval/skills/search-by-content',
      hits: [{ id: 'artifact_1', score: 0.9, reason: 'match', scope: 'project' }],
      returnedIds: ['artifact_1'],
      artifactIds: ['artifact_1'],
      isEmpty: false,
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    expect(verdicts.passed).toBe(false);
    expect(hasGovernanceFailure(verdicts)).toBe(true);
  });
});

// =============================================================================
// Tests: Execution Warnings
// =============================================================================

describe('execution warnings', () => {
  it('elevates degraded warnings to verdict visibility', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'empty',
        relevance: { relevantIds: [], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    const result = makeResult({ isEmpty: true });

    const warnings: AdapterWarning[] = [
      { code: 'route-error', message: 'Route returned 500', degraded: true },
    ];

    const verdicts = evaluateVerdicts(testCase, result, warnings);

    expect(verdicts.passed).toBe(false);
    expect(hasExecutionIssue(verdicts)).toBe(true);
    expect(verdicts.warnings).toEqual(warnings);
  });

  it('passes with non-degraded warnings', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'empty',
        relevance: { relevantIds: [], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    const result = makeResult({ isEmpty: true });

    const warnings: AdapterWarning[] = [
      { code: 'client-error', message: 'Client error occurred', degraded: false },
    ];

    const verdicts = evaluateVerdicts(testCase, result, warnings);

    // Non-degraded warnings don't cause failure
    expect(verdicts.passed).toBe(true);
    expect(hasExecutionIssue(verdicts)).toBe(false);
    // But warnings are still visible
    expect(verdicts.warnings).toEqual(warnings);
  });

  it('propagates adapter warnings into case results', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'empty',
        relevance: { relevantIds: [], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    const result = makeResult({ isEmpty: true });

    const warnings: AdapterWarning[] = [
      { code: 'fallback-used', message: 'Fallback to direct execution', degraded: false },
    ];

    const verdicts = evaluateVerdicts(testCase, result, warnings);

    expect(verdicts.warnings).toHaveLength(1);
    expect(verdicts.warnings[0]?.code).toBe('fallback-used');
  });
});

// =============================================================================
// Tests: Governance Separate from Metrics
// =============================================================================

describe('governance verdicts separate from ranking metrics', () => {
  it('governance failures are separate from ranking metric summaries', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['relevant_1'], idealOrder: [] },
        governance: {
          forbiddenIds: ['forbidden_1'],
          forbiddenReasons: ['cross-team'],
        },
        shape: {},
      },
    });

    // Result has good ranking (relevant_1 at position 1) but governance failure
    const result = makeResult({
      hits: [
        { id: 'relevant_1', score: 0.95, reason: 'match', scope: 'project' },
        { id: 'forbidden_1', score: 0.9, reason: 'match', scope: 'project' },
      ],
      returnedIds: ['relevant_1', 'forbidden_1'],
      isEmpty: false,
      buckets: {
        globalConstraints: [],
        projectKnowledge: ['relevant_1', 'forbidden_1'],
      },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    // Governance should fail despite good ranking
    expect(verdicts.governance.passed).toBe(false);
    expect(verdicts.passed).toBe(false);
    expect(verdicts.governance.forbiddenHits).toContain('forbidden_1');

    // Verdicts object is separate from metrics
    expect(verdicts.verdicts).toBeDefined();
    expect(verdicts.verdicts.some((v) => v.kind === 'governance' && !v.passed)).toBe(true);
  });

  it('governance passes with poor ranking', () => {
    const testCase = makeTestCase({
      expected: {
        outcome: 'non-empty',
        relevance: { relevantIds: ['relevant_1', 'relevant_2'], idealOrder: [] },
        governance: { forbiddenIds: [], forbiddenReasons: [] },
        shape: {},
      },
    });

    // Result has poor ranking (no relevant IDs) but governance passes
    const result = makeResult({
      hits: [
        { id: 'irrelevant_1', score: 0.5, reason: 'match', scope: 'project' },
        { id: 'irrelevant_2', score: 0.4, reason: 'match', scope: 'project' },
      ],
      returnedIds: ['irrelevant_1', 'irrelevant_2'],
      isEmpty: false,
      buckets: {
        globalConstraints: [],
        projectKnowledge: ['irrelevant_1', 'irrelevant_2'],
      },
    });

    const verdicts = evaluateVerdicts(testCase, result, []);

    // Governance passes (no forbidden hits, outcome matches)
    expect(verdicts.governance.passed).toBe(true);
    expect(verdicts.passed).toBe(true);
  });
});
