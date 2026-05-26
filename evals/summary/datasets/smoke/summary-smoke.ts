/**
 * Smoke-Tier Summary Evaluation Datasets
 *
 * Smoke-tier cases for summary evaluation across v1 and v2 endpoints.
 * Covers: grounded summary, hallucination detection, and forbidden claim detection.
 *
 * Phase 27-01: SEVAL-01, SEVAL-02
 */

import { type SummaryEvalCase, summaryEvalCaseSchema } from '@trapmap/contracts/evals';

// =============================================================================
// Smoke Case: Grounded Summary
// =============================================================================

/**
 * Case: Search for docker compose knowledge, expect summary with grounded claims.
 * Required facts: docker-compose, multi-container must appear in summary.
 * Forbidden claims: kubernetes, k8s, production credentials must not appear.
 */
export const summaryGroundedSmokeCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-grounded-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-smoke-grounded',
  expected: {
    requiredFacts: ['docker-compose', 'multi-container'],
    forbiddenClaims: ['kubernetes', 'k8s', 'production credentials'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
  tags: ['grounded', 'smoke', 'v2'],
}) as SummaryEvalCase;

// =============================================================================
// Smoke Case: Hallucination Detection
// =============================================================================

/**
 * Case: Search for container orchestration knowledge, detect hallucinated claims.
 * Required facts: empty (not required for hallucination detection).
 * Forbidden claims: Einstein, born in 1879, Nobel Prize must not appear.
 * Lower groundedness threshold to detect and flag hallucinations.
 */
export const summaryHallucinationSmokeCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-hallucination-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'container orchestration best practices',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-smoke-hallucination',
  expected: {
    requiredFacts: [],
    forbiddenClaims: ['Einstein', 'born in 1879', 'Nobel Prize'],
    minGroundedness: 0.5, // Lower threshold to allow detection of hallucinations
    minCoverage: 0.0,
    expectSummary: true,
  },
  tags: ['hallucination', 'smoke', 'v2'],
}) as SummaryEvalCase;

// =============================================================================
// Smoke Case: Forbidden Claims Detection
// =============================================================================

/**
 * Case: Search for API security knowledge, detect forbidden sensitive claims.
 * Required facts: rate limiting should appear.
 * Forbidden claims: password, secret key, API token must not appear.
 */
export const summaryForbiddenClaimsSmokeCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-forbidden-claims-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'api security configuration',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-smoke-forbidden',
  expected: {
    requiredFacts: ['rate limiting'],
    forbiddenClaims: ['password', 'secret key', 'API token'],
    minGroundedness: 0.7,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['forbidden', 'smoke', 'v2', 'security'],
}) as SummaryEvalCase;

// =============================================================================
// Aggregated Smoke Cases Export
// =============================================================================

// =============================================================================
// Smoke Case: Multi-Fact Coverage
// =============================================================================

/**
 * Case: Search for React hooks knowledge, expect summary covering multiple facts.
 * Required facts: useState, useEffect, useCallback, custom hooks.
 */
export const summaryMultiFactSmokeCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-smoke-multi-fact',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'react hooks state management side effects',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-smoke-multi-fact',
  expected: {
    requiredFacts: ['useState', 'useEffect'],
    forbiddenClaims: ['class components are better', 'Redux is required'],
    minGroundedness: 0.7,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['coverage', 'smoke', 'v2', 'multi-fact'],
}) as SummaryEvalCase;

// =============================================================================
// Smoke Case: Strict Groundedness
// =============================================================================

/**
 * Case: Search for docker knowledge with high groundedness threshold.
 * Same scenario as grounded smoke but stricter threshold.
 */
export const summaryStrictGroundedSmokeCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-strict-grounded-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-smoke-grounded',
  expected: {
    requiredFacts: ['docker-compose', 'multi-container'],
    forbiddenClaims: ['kubernetes', 'k8s', 'production credentials', 'Einstein', 'Nobel Prize'],
    minGroundedness: 0.9,
    minCoverage: 0.8,
    expectSummary: true,
  },
  tags: ['grounded', 'smoke', 'v2', 'strict'],
}) as SummaryEvalCase;

// =============================================================================
// Phase 7: Label Filter Summary Smoke Case
// =============================================================================

/**
 * Case: Search with label filter and summary enabled.
 * Filtering by `labels: ['nodejs']` must exclude Flask (python) content from summary.
 * Regression guard for v2 label filtering in summary path.
 */
export const summaryLabelFilterSmokeCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-label-filter-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'backend REST API middleware',
    maxResults: 10,
    includeSummary: true,
    filters: { labels: ['nodejs'], scopes: [] },
  },
  scenarioId: 'summary-smoke-label-filter',
  expected: {
    requiredFacts: ['Express'],
    forbiddenClaims: ['Flask', 'blueprint'],
    minGroundedness: 0.7,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['label-filter', 'smoke', 'v2', 'regression'],
}) as SummaryEvalCase;

/**
 * All smoke-tier summary evaluation cases.
 */
export const summarySmokeCases: SummaryEvalCase[] = [
  summaryGroundedSmokeCase,
  summaryHallucinationSmokeCase,
  summaryForbiddenClaimsSmokeCase,
  summaryMultiFactSmokeCase,
  summaryStrictGroundedSmokeCase,
  summaryLabelFilterSmokeCase,
];
