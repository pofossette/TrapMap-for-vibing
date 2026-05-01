/**
 * Smoke-Tier Summary Evaluation Datasets
 *
 * Smoke-tier cases for summary evaluation across v1 and v2 endpoints.
 * Covers: grounded summary, hallucination detection, and forbidden claim detection.
 *
 * Phase 27-01: SEVAL-01, SEVAL-02
 */

import {
  type SummaryEvalCase,
  summaryEvalCaseSchema,
} from '@trapmap/contracts';

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

/**
 * All smoke-tier summary evaluation cases.
 */
export const summarySmokeCases: SummaryEvalCase[] = [
  summaryGroundedSmokeCase,
  summaryHallucinationSmokeCase,
  summaryForbiddenClaimsSmokeCase,
];
