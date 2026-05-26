/**
 * Evaluation Report Contracts
 *
 * Phase 27-01: SEVAL-01, SEVAL-02 (Summary Eval)
 * Phase 29-03: EOPS-03 (Retrieval Eval)
 * Canonical schemas for machine-readable evaluation reports.
 */

import { z } from 'zod';

import { retrievalStrategySchema, routeFamilySchema, routingReasonSchema } from '../retrieval.js';
import { retrievalEvalEndpointSchema, retrievalEvalTierSchema } from './retrieval.js';
import { summaryEvalEndpointSchema, summaryEvalTierSchema } from './summary.js';

// =============================================================================
// Summary Evaluation Report Schemas
// =============================================================================

export const summaryEvalReportMetaSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(0),
  llmProvider: z.enum(['openai', 'fallback']),
  options: z.object({
    tier: summaryEvalTierSchema,
    endpoint: summaryEvalEndpointSchema.optional(),
    dryRun: z.boolean(),
    allowEmpty: z.boolean(),
    verbose: z.number().int().min(0),
  }),
});

export type SummaryEvalReportMeta = z.infer<typeof summaryEvalReportMetaSchema>;

export const summaryEvalClaimResultSchema = z.object({
  text: z.string().min(1),
  supported: z.boolean(),
  evidence: z.string().optional(),
});

export type SummaryEvalClaimResult = z.infer<typeof summaryEvalClaimResultSchema>;

export const summaryEvalCaseResultSchema = z
  .object({
    caseId: z.string().min(1),
    endpoint: summaryEvalEndpointSchema,
    tier: summaryEvalTierSchema,
    passed: z.boolean(),
    groundednessScore: z.number().min(0).max(1),
    coverageScore: z.number().min(0).max(1),
    claimsTotal: z.number().int().min(0),
    claimsSupported: z.number().int().min(0),
    requiredFactsCovered: z.array(z.string()),
    requiredFactsMissing: z.array(z.string()),
    forbiddenClaimsFound: z.array(z.string()),
    durationMs: z.number().int().min(0),
  })
  .strict();

export type SummaryEvalCaseResult = z.infer<typeof summaryEvalCaseResultSchema>;

export const summaryEvalFailureKindSchema = z.enum([
  'groundedness-below-threshold',
  'coverage-below-threshold',
  'forbidden-claim-found',
  'missing-summary',
  'execution-error',
]);

export type SummaryEvalFailureKind = z.infer<typeof summaryEvalFailureKindSchema>;

export const summaryEvalFailureRecordSchema = z.object({
  caseId: z.string().min(1),
  kind: summaryEvalFailureKindSchema,
  description: z.string().min(1),
});

export type SummaryEvalFailureRecord = z.infer<typeof summaryEvalFailureRecordSchema>;

export const summaryEvalReportSchema = z
  .object({
    meta: summaryEvalReportMetaSchema,
    summary: z.object({
      totalCases: z.number().int().min(0),
      passedCases: z.number().int().min(0),
      failedCases: z.number().int().min(0),
      passRate: z.number().min(0).max(1),
      passed: z.boolean(),
      avgGroundedness: z.number().min(0).max(1),
      avgCoverage: z.number().min(0).max(1),
      forbiddenClaimHits: z.number().int().min(0),
    }),
    cases: z.array(summaryEvalCaseResultSchema),
    failures: z.array(summaryEvalFailureRecordSchema),
  })
  .refine(
    (d) => {
      if (d.summary.totalCases === 0) return d.summary.passRate === 0;
      return d.summary.passRate === d.summary.passedCases / d.summary.totalCases;
    },
    { message: 'passRate must equal passedCases / totalCases' },
  );

export type SummaryEvalReport = z.infer<typeof summaryEvalReportSchema>;

// =============================================================================
// Retrieval Evaluation Report Schemas (Phase 29-03: EOPS-03)
// =============================================================================

export const retrievalEvalFailureKindSchema = z.enum([
  'forbidden-hit',
  'unexpected-empty',
  'unexpected-non-empty',
  'shape-mismatch',
  'execution-error',
]);

export type RetrievalEvalFailureKind = z.infer<typeof retrievalEvalFailureKindSchema>;

export const retrievalEvalSliceKeySchema = z.object({
  tier: retrievalEvalTierSchema,
  endpoint: retrievalEvalEndpointSchema,
  mode: z.enum(['semantic', 'hybrid', 'graph-assisted']).optional(),
});

export type RetrievalEvalSliceKey = z.infer<typeof retrievalEvalSliceKeySchema>;

// =============================================================================
// Query-Type Cohort Schemas (Phase 31-01: EOPS-01)
// =============================================================================

/**
 * Query type cohort classification for cross-slice analysis.
 * Groups evaluation cases by semantic query category rather than
 * just endpoint/mode combinations.
 */
export const queryTypeCohortSchema = z.enum([
  'error-debugging',
  'how-to',
  'global-constraints',
  'governance-sensitive',
  'general',
]);

export type QueryTypeCohort = z.infer<typeof queryTypeCohortSchema>;

/**
 * Cohort key for aggregating metrics by query type and route family.
 * Route family distinguishes between entry-based (v1) and capsule-based (v2) retrieval.
 */
export const cohortKeySchema = z.object({
  queryType: queryTypeCohortSchema,
  routeFamily: routeFamilySchema,
});

export type CohortKey = z.infer<typeof cohortKeySchema>;

/**
 * Summary metrics for a single cohort.
 * Aggregates cases by query type and route family for cross-slice analysis.
 */
export const cohortSummarySchema = z.object({
  cohort: cohortKeySchema,
  caseCount: z.number().int().min(0),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  passRate: z.number().min(0).max(1),
  avgHitAt1: z.number().min(0).max(1),
  avgMrr: z.number().min(0).max(1),
  governanceFailureCount: z.number().int().min(0),
  regressionStatus: z
    .enum(['regressed', 'stable', 'improved', 'no-baseline'])
    .default('no-baseline'),
});

export type CohortSummary = z.infer<typeof cohortSummarySchema>;

// =============================================================================
// Mode Comparison Schemas (Phase 31-02: EOPS-01)
// =============================================================================

/**
 * Mode comparison for analyzing client-requested vs router-selected modes.
 * Phase 31-02: EOPS-01
 */
export const modeComparisonSchema = z.object({
  /** Client-requested mode (v1 only) */
  clientMode: z.enum(['semantic', 'hybrid', 'graph-assisted']).optional(),
  /** Router-selected internal mode */
  selectedMode: retrievalStrategySchema.optional(),
  /** Routing reason code */
  routingReason: routingReasonSchema.optional(),
  /** Whether fallback was applied */
  fallbackApplied: z.boolean().default(false),
  /** Count of cases with this combination */
  caseCount: z.number().int().min(0),
  /** Average Hit@1 for this mode combination */
  avgHitAt1: z.number().min(0).max(1),
  /** Average MRR for this mode combination */
  avgMrr: z.number().min(0).max(1),
});

export type ModeComparison = z.infer<typeof modeComparisonSchema>;

/**
 * Distribution of routing reasons across all cases.
 * Phase 31-02: EOPS-01
 */
export const routingDistributionSchema = z.object({
  /** Routing reason code */
  reason: routingReasonSchema,
  /** Count of cases with this reason */
  count: z.number().int().min(0),
  /** Percentage of total cases */
  percentage: z.number().min(0).max(100),
});

export type RoutingDistribution = z.infer<typeof routingDistributionSchema>;

// =============================================================================
// Baseline Report Schemas (Phase 31-03: EOPS-02, EOPS-03)
// =============================================================================

/**
 * Baseline slice data for comparison.
 * Captures metrics from a single slice for regression detection.
 */
export const baselineSliceSchema = z.object({
  slice: retrievalEvalSliceKeySchema,
  routeFamily: routeFamilySchema.optional(),
  avgHitAt1: z.number().min(0).max(1),
  avgHitAt5: z.number().min(0).max(1),
  avgHitAt10: z.number().min(0).max(1),
  avgMrr: z.number().min(0).max(1),
  avgNdcg: z.number().min(0).max(1),
  avgRecallAt10: z.number().min(0).max(1),
  selectedMode: retrievalStrategySchema.optional(),
  fallbackApplied: z.boolean().default(false),
  passRate: z.number().min(0).max(1),
});

export type BaselineSlice = z.infer<typeof baselineSliceSchema>;

/**
 * Baseline cohort data for comparison.
 * Phase 31-03: EOPS-03
 */
export const baselineCohortSchema = z.object({
  cohort: cohortKeySchema,
  avgHitAt1: z.number().min(0).max(1),
  avgMrr: z.number().min(0).max(1),
  passRate: z.number().min(0).max(1),
  governanceFailureCount: z.number().int().min(0),
});

export type BaselineCohort = z.infer<typeof baselineCohortSchema>;

/**
 * Governance failure record for baseline.
 * Captures governance issues for trend analysis.
 */
export const baselineGovernanceFailureSchema = z.object({
  caseId: z.string().min(1),
  endpoint: retrievalEvalEndpointSchema,
  tier: retrievalEvalTierSchema,
  failureKinds: z.array(z.string()),
});

export type BaselineGovernanceFailure = z.infer<typeof baselineGovernanceFailureSchema>;

/**
 * Baseline report schema for CI artifact retention.
 * Phase 31-03: EOPS-03
 *
 * This schema captures a snapshot of evaluation results for comparison
 * against future runs. Baselines are written by scheduled core runs and
 * compared against by PR smoke runs.
 */
export const baselineReportSchema = z
  .object({
    /** Schema version for future compatibility */
    schemaVersion: z.literal(1),
    /** Timestamp when baseline was captured */
    timestamp: z.string().datetime({ offset: true }),
    /** Tier this baseline represents */
    tier: retrievalEvalTierSchema,
    /** Git commit SHA for traceability */
    commitSha: z.string().min(7).optional(),
    /** Git branch name */
    branch: z.string().min(1).optional(),
    /** Slice metrics captured in this baseline */
    slices: z.array(baselineSliceSchema),
    /** Cohort metrics captured in this baseline */
    cohorts: z.array(baselineCohortSchema).optional(),
    /** Governance failures captured in this baseline */
    governanceFailures: z.array(baselineGovernanceFailureSchema),
    /** Total cases in the baseline run */
    totalCases: z.number().int().min(0),
    /** Total passed cases */
    passedCases: z.number().int().min(0),
    /** Overall pass rate */
    passRate: z.number().min(0).max(1),
    /** Duration of baseline run in ms */
    durationMs: z.number().int().min(0),
  })
  .refine(
    (d) => {
      if (d.totalCases === 0) return d.passRate === 0;
      return d.passRate === d.passedCases / d.totalCases;
    },
    { message: 'passRate must equal passedCases / totalCases' },
  );

export type BaselineReport = z.infer<typeof baselineReportSchema>;

/**
 * Regression threshold configuration.
 * Phase 31-03: EOPS-02
 *
 * Different thresholds for PR smoke vs scheduled core runs.
 */
export const regressionThresholdsSchema = z.object({
  /** Minimum acceptable Hit@1 change (negative = regression) */
  hitAt1Threshold: z.number().min(-1).max(0).default(-0.05),
  /** Minimum acceptable MRR change (negative = regression) */
  mrrThreshold: z.number().min(-1).max(0).default(-0.05),
  /** Minimum acceptable pass rate change (negative = regression) */
  passRateThreshold: z.number().min(-1).max(0).default(-0.05),
  /** Maximum allowed governance failure increase */
  maxGovernanceIncrease: z.number().int().min(0).default(0),
});

export type RegressionThresholds = z.infer<typeof regressionThresholdsSchema>;

/**
 * Predefined threshold presets by tier.
 */
export const TIER_THRESHOLDS: Record<'smoke' | 'core', RegressionThresholds> = {
  smoke: {
    hitAt1Threshold: -0.1, // More lenient for PR smoke
    mrrThreshold: -0.1,
    passRateThreshold: -0.1,
    maxGovernanceIncrease: 1, // Allow 1 additional governance failure
  },
  core: {
    hitAt1Threshold: -0.05, // Stricter for scheduled core
    mrrThreshold: -0.05,
    passRateThreshold: -0.05,
    maxGovernanceIncrease: 0, // No additional governance failures allowed
  },
};

/**
 * Result of comparing current run against baseline.
 * Phase 31-03: EOPS-03
 */
export const regressionResultSchema = z.object({
  /** Whether any regressions were detected */
  hasRegressions: z.boolean(),
  /** Slices that regressed */
  regressedSlices: z.array(
    z.object({
      slice: retrievalEvalSliceKeySchema,
      baselineHitAt1: z.number(),
      currentHitAt1: z.number(),
      hitAt1Delta: z.number(),
      baselineMrr: z.number(),
      currentMrr: z.number(),
      mrrDelta: z.number(),
    }),
  ),
  /** Slices that improved */
  improvedSlices: z.array(
    z.object({
      slice: retrievalEvalSliceKeySchema,
      baselineHitAt1: z.number(),
      currentHitAt1: z.number(),
      hitAt1Delta: z.number(),
      baselineMrr: z.number(),
      currentMrr: z.number(),
      mrrDelta: z.number(),
    }),
  ),
  /** Cohorts that regressed */
  regressedCohorts: z.array(
    z.object({
      cohort: cohortKeySchema,
      baselineHitAt1: z.number(),
      currentHitAt1: z.number(),
      hitAt1Delta: z.number(),
    }),
  ),
  /** Governance regression count */
  governanceRegressions: z.number().int().min(0),
  /** Whether baseline was available for comparison */
  baselineAvailable: z.boolean(),
  /** Timestamp of baseline used for comparison */
  baselineTimestamp: z.string().datetime({ offset: true }).optional(),
});

export type RegressionResult = z.infer<typeof regressionResultSchema>;

export const retrievalEvalReportMetaSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(0),
  options: z.object({
    tier: retrievalEvalTierSchema,
    endpoint: retrievalEvalEndpointSchema.optional(),
    dryRun: z.boolean(),
    allowEmpty: z.boolean(),
    verbose: z.number().int().min(0),
  }),
  baselinePath: z.string().optional(),
  isBaselineWrite: z.boolean().default(false),
});

export type RetrievalEvalReportMeta = z.infer<typeof retrievalEvalReportMetaSchema>;

export const retrievalEvalSliceSummarySchema = z
  .object({
    slice: retrievalEvalSliceKeySchema,
    routeFamily: routeFamilySchema.optional(),
    caseCount: z.number().int().min(0),
    passedCount: z.number().int().min(0),
    failedCount: z.number().int().min(0),
    passRate: z.number().min(0).max(1),
    avgHitAt1: z.number().min(0).max(1),
    avgHitAt5: z.number().min(0).max(1),
    avgHitAt10: z.number().min(0).max(1),
    avgMrr: z.number().min(0).max(1),
    avgNdcg: z.number().min(0).max(1),
    avgRecallAt10: z.number().min(0).max(1),
    governanceFailureCount: z.number().int().min(0),
    outcomeMismatchCount: z.number().int().min(0),
    executionIssueCount: z.number().int().min(0),
    selectedMode: retrievalStrategySchema.optional(),
    fallbackApplied: z.boolean().default(false),
    regressionStatus: z
      .enum(['regressed', 'stable', 'improved', 'no-baseline'])
      .default('no-baseline'),
  })
  .refine((d) => d.passedCount <= d.caseCount, {
    message: 'passedCount must be <= caseCount',
  });

export type RetrievalEvalSliceSummary = z.infer<typeof retrievalEvalSliceSummarySchema>;

export const retrievalEvalCaseSummarySchema = z.object({
  caseId: z.string().min(1),
  endpoint: retrievalEvalEndpointSchema,
  tier: retrievalEvalTierSchema,
  passed: z.boolean(),
  outcomeMatch: z.boolean(),
  governancePassed: z.boolean(),
  durationMs: z.number().int().min(0),
  hitAt1: z.number().min(0).max(1),
  hitAt5: z.number().min(0).max(1),
  hitAt10: z.number().min(0).max(1),
  mrr: z.number().min(0).max(1),
  ndcg: z.number().min(0).max(1),
  recallAt10: z.number().min(0).max(1),
  selectedMode: retrievalStrategySchema.optional(),
  routingReason: routingReasonSchema.optional(),
  fallbackApplied: z.boolean().default(false),
});

export type RetrievalEvalCaseSummary = z.infer<typeof retrievalEvalCaseSummarySchema>;

export const retrievalEvalFailureRecordSchema = z.object({
  caseId: z.string().min(1),
  kind: retrievalEvalFailureKindSchema,
  description: z.string().min(1),
  ids: z.array(z.string()),
  endpoint: retrievalEvalEndpointSchema,
  tier: retrievalEvalTierSchema,
});

export type RetrievalEvalFailureRecord = z.infer<typeof retrievalEvalFailureRecordSchema>;

export const retrievalEvalWarningRecordSchema = z
  .object({
    caseId: z.string().min(1),
    code: z.string().min(1),
    message: z.string().min(1),
    degraded: z.boolean(),
  })
  .strict();

export type RetrievalEvalWarningRecord = z.infer<typeof retrievalEvalWarningRecordSchema>;

export type ReportBuilderInput = {
  meta: {
    options: {
      tier: string;
      endpoint?: string;
      dryRun: boolean;
      allowEmpty: boolean;
      verbose: number;
    };
  };
};

export const retrievalEvalReportSchema = z
  .object({
    meta: retrievalEvalReportMetaSchema,
    summary: z.object({
      totalCases: z.number().int().min(0),
      passedCases: z.number().int().min(0),
      failedCases: z.number().int().min(0),
      passRate: z.number().min(0).max(1),
      passed: z.boolean(),
    }),
    slices: z.array(retrievalEvalSliceSummarySchema),
    cohorts: z.array(cohortSummarySchema).optional(),
    modeComparisons: z.array(modeComparisonSchema).optional(),
    routingDistribution: z.array(routingDistributionSchema).optional(),
    cases: z.array(retrievalEvalCaseSummarySchema),
    failures: z.array(retrievalEvalFailureRecordSchema),
    warnings: z.array(retrievalEvalWarningRecordSchema),
  })
  .refine((d) => d.cases.length === d.summary.totalCases, {
    message: 'cases.length must equal totalCases',
  })
  .refine((d) => d.failures.length >= d.summary.failedCases, {
    message: 'failures.length must be >= failedCases',
  });

export type RetrievalEvalReport = z.infer<typeof retrievalEvalReportSchema>;
