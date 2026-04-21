/**
 * Summary Evaluation Report Contract
 *
 * Phase 27-01: SEVAL-01, SEVAL-02
 * Canonical schema for machine-readable summary evaluation reports.
 * This contract validates through shared contracts so future CLI or automation
 * consumers can rely on one contract.
 *
 * Design:
 * - Reports are serializable JSON for CI tooling and regression detection
 * - LLM provider is tracked for judge reproducibility
 * - Groundedness and coverage scores are first-class metrics
 * - Forbidden claim hits are tracked for hallucination detection
 */

import { z } from 'zod';

import { summaryEvalTierSchema, summaryEvalEndpointSchema } from './summary.js';

// =============================================================================
// Report Metadata
// =============================================================================

/**
 * Summary evaluation report metadata schema.
 */
export const summaryEvalReportMetaSchema = z.object({
  /** Report schema version */
  schemaVersion: z.literal(1),
  /** Timestamp of report generation (ISO 8601) */
  timestamp: z.string().datetime(),
  /** Duration of evaluation run in milliseconds */
  durationMs: z.number().int().min(0),
  /** LLM provider used for judge-driven verification */
  llmProvider: z.enum(['openai', 'fallback']),
  /** Runner options used for this evaluation */
  options: z.object({
    tier: summaryEvalTierSchema,
    endpoint: summaryEvalEndpointSchema.optional(),
    dryRun: z.boolean(),
    allowEmpty: z.boolean(),
    verbose: z.number().int().min(0),
  }),
});

export type SummaryEvalReportMeta = z.infer<typeof summaryEvalReportMetaSchema>;

// =============================================================================
// Claim Result Schema
// =============================================================================

/**
 * Single claim verification result.
 * Represents the judge's assessment of whether a claim is supported by context.
 */
export const summaryEvalClaimResultSchema = z.object({
  /** The claim text from the summary */
  text: z.string(),
  /** Whether the claim is supported by the retrieved context */
  supported: z.boolean(),
  /** Supporting evidence from context (if supported) */
  evidence: z.string().optional(),
});

export type SummaryEvalClaimResult = z.infer<typeof summaryEvalClaimResultSchema>;

// =============================================================================
// Case Result Schema
// =============================================================================

/**
 * Single case evaluation result.
 * Contains all metrics and verification results for a summary eval case.
 */
export const summaryEvalCaseResultSchema = z.object({
  /** Case ID */
  caseId: z.string().min(1),
  /** Endpoint evaluated */
  endpoint: summaryEvalEndpointSchema,
  /** Tier of the case */
  tier: summaryEvalTierSchema,
  /** Whether the case passed overall */
  passed: z.boolean(),
  /** Groundedness score (ratio of supported claims) */
  groundednessScore: z.number().min(0).max(1),
  /** Coverage score (ratio of required facts covered) */
  coverageScore: z.number().min(0).max(1),
  /** Total number of claims extracted from summary */
  claimsTotal: z.number().int().min(0),
  /** Number of claims supported by context */
  claimsSupported: z.number().int().min(0),
  /** Required facts that were found in the summary */
  requiredFactsCovered: z.array(z.string()),
  /** Required facts that were missing from the summary */
  requiredFactsMissing: z.array(z.string()),
  /** Forbidden claims that were found in the summary (hallucinations) */
  forbiddenClaimsFound: z.array(z.string()),
  /** Execution duration in milliseconds */
  durationMs: z.number().int().min(0),
});

export type SummaryEvalCaseResult = z.infer<typeof summaryEvalCaseResultSchema>;

// =============================================================================
// Failure Record Schema
// =============================================================================

/**
 * Failure kind enumeration for summary evaluation.
 */
export const summaryEvalFailureKindSchema = z.enum([
  'groundedness-below-threshold',
  'coverage-below-threshold',
  'forbidden-claim-found',
  'missing-summary',
  'execution-error',
]);

export type SummaryEvalFailureKind = z.infer<typeof summaryEvalFailureKindSchema>;

/**
 * Single failure record for a case.
 */
export const summaryEvalFailureRecordSchema = z.object({
  /** Case ID where failure occurred */
  caseId: z.string().min(1),
  /** Kind of failure */
  kind: summaryEvalFailureKindSchema,
  /** Human-readable description */
  description: z.string().min(1),
});

export type SummaryEvalFailureRecord = z.infer<typeof summaryEvalFailureRecordSchema>;

// =============================================================================
// Full Report Schema
// =============================================================================

/**
 * Full summary evaluation report schema.
 * This is the canonical structure emitted by the runner.
 */
export const summaryEvalReportSchema = z.object({
  /** Report metadata */
  meta: summaryEvalReportMetaSchema,
  /** Overall summary */
  summary: z.object({
    /** Total cases evaluated */
    totalCases: z.number().int().min(0),
    /** Cases passed */
    passedCases: z.number().int().min(0),
    /** Cases failed */
    failedCases: z.number().int().min(0),
    /** Overall pass rate (0-1) */
    passRate: z.number().min(0).max(1),
    /** Whether evaluation passed overall */
    passed: z.boolean(),
    /** Average groundedness score across all cases */
    avgGroundedness: z.number().min(0).max(1),
    /** Average coverage score across all cases */
    avgCoverage: z.number().min(0).max(1),
    /** Total forbidden claim hits across all cases */
    forbiddenClaimHits: z.number().int().min(0),
  }),
  /** All case results, sorted by case ID */
  cases: z.array(summaryEvalCaseResultSchema),
  /** All failure records, sorted by case ID, then by kind */
  failures: z.array(summaryEvalFailureRecordSchema),
});

export type SummaryEvalReport = z.infer<typeof summaryEvalReportSchema>;
