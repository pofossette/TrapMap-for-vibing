/**
 * Core-Tier Summary Evaluation Datasets
 *
 * Core-tier cases covering groundedness with mixed claims, multi-fact
 * coverage, governance boundary enforcement, and empty-result handling.
 */

import { type SummaryEvalCase, summaryEvalCaseSchema } from '../../../types/index.js';

// =============================================================================
// Core Case: Mixed Groundedness
// =============================================================================

export const summaryCoreMixedGroundedCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-mixed-grounded',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'typescript strict mode type safety',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-core-mixed-grounded',
  expected: {
    requiredFacts: ['strict mode', 'noUncheckedIndexedAccess'],
    forbiddenClaims: ['any type is fine', 'disable strict mode', 'eval('],
    minGroundedness: 0.6,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['groundedness', 'core', 'v2', 'mixed'],
}) as SummaryEvalCase;

// =============================================================================
// Core Case: Multi-Fact Coverage
// =============================================================================

export const summaryCoreMultiFactCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-multi-fact',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'CI/CD pipeline setup with GitHub Actions',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-core-multi-fact',
  expected: {
    requiredFacts: ['GitHub Actions', 'lint', 'typecheck', 'branch protection'],
    forbiddenClaims: ['Jenkins', 'Travis CI', 'deploy without tests'],
    minGroundedness: 0.7,
    minCoverage: 0.6,
    expectSummary: true,
  },
  tags: ['coverage', 'core', 'v2', 'multi-fact'],
}) as SummaryEvalCase;

// =============================================================================
// Core Case: Governance Boundary
// =============================================================================

export const summaryCoreGovernanceCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-governance',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'authentication security best practices',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-core-governance',
  expected: {
    requiredFacts: ['JWT', 'httpOnly', 'CSRF'],
    forbiddenClaims: ['private key', 'admin password', 'database credentials'],
    minGroundedness: 0.7,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['forbidden', 'core', 'v2', 'governance', 'security'],
}) as SummaryEvalCase;

// =============================================================================
// Core Case: Empty Result
// =============================================================================

export const summaryCoreEmptyCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-empty-result',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'quantum computing entanglement protocols',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-core-empty',
  expected: {
    requiredFacts: [],
    forbiddenClaims: [],
    minGroundedness: 0.0,
    minCoverage: 0.0,
    expectSummary: false,
  },
  tags: ['empty', 'core', 'v2', 'boundary'],
}) as SummaryEvalCase;

// =============================================================================
// Core Case: v1 Endpoint Coverage
// =============================================================================

export const summaryCoreV1Case = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-v1-grounded',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'typescript strict mode configuration',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-core-mixed-grounded',
  expected: {
    requiredFacts: ['strict mode'],
    forbiddenClaims: ['any type is fine'],
    minGroundedness: 0.6,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['groundedness', 'core', 'v1'],
}) as SummaryEvalCase;

// =============================================================================
// Aggregated Core Cases Export
// =============================================================================

// =============================================================================
// Core Case: Label Filter Summary
// =============================================================================

/**
 * Case: Search with label filter, verify summary reflects filtered knowledge.
 * Only Node.js content should appear in summary, not Python.
 */
export const summaryCoreLabelFilterCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-label-filter',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'backend REST API middleware',
    maxResults: 10,
    includeSummary: true,
    filters: {
      labels: ['nodejs'],
      scopes: [],
    },
  },
  scenarioId: 'summary-core-label-filter',
  expected: {
    requiredFacts: ['Express', 'middleware'],
    forbiddenClaims: ['Flask', 'Python', 'Django'],
    minGroundedness: 0.7,
    minCoverage: 0.5,
    expectSummary: true,
  },
  tags: ['label-filter', 'core', 'v2', 'backend'],
}) as SummaryEvalCase;

// =============================================================================
// Core Case: Low Confidence Detection
// =============================================================================

/**
 * Case: Search for TypeScript knowledge, detect low-confidence claims.
 * Lower groundedness threshold to catch edge-case claims.
 */
export const summaryCoreLowConfidenceCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'summary-core-low-confidence',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'typescript strict mode configuration',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'summary-core-mixed-grounded',
  expected: {
    requiredFacts: ['strict mode'],
    forbiddenClaims: ['any type is fine', 'disable strict mode'],
    minGroundedness: 0.4,
    minCoverage: 0.3,
    expectSummary: true,
  },
  tags: ['groundedness', 'core', 'v2', 'low-confidence'],
}) as SummaryEvalCase;

export const summaryCoreCases: SummaryEvalCase[] = [
  summaryCoreMixedGroundedCase,
  summaryCoreMultiFactCase,
  summaryCoreGovernanceCase,
  summaryCoreEmptyCase,
  summaryCoreV1Case,
  summaryCoreLabelFilterCase,
  summaryCoreLowConfidenceCase,
];
