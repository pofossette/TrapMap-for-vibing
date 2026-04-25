/**
 * Shared runner result and slice types for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01, REVAL-03
 * Phase 29-03: EOPS-03 (baseline-aware eval result types)
 * These types support the execution substrate, normalization, and reporting.
 */

import type {
  RetrievalEvalCase,
  RetrievalEvalEndpoint,
  RetrievalEvalTier,
  RetrievalStrategy,
  RoutingReason,
  QueryTypeCohort,
  CohortKey,
  CohortSummary,
  ModeComparison,
  RoutingDistribution,
} from '@trapmap/contracts';

// =============================================================================
// Execution Metadata Types
// =============================================================================

/**
 * Adapter type indicating how a case was executed.
 * - 'route': Executed through Fastify inject() against the registered route
 * - 'direct': Executed directly through searchKnowledge/searchKnowledgeV2 (fallback)
 */
export type AdapterType = 'route' | 'direct';

/**
 * Execution metadata recorded for each case run.
 * Phase 29-03: EOPS-03 (routing trace fields)
 */
export interface ExecutionMetadata {
  /** Which adapter was used for execution */
  adapterType: AdapterType;
  /** Whether a compatibility fallback was triggered */
  fallbackUsed: boolean;
  /** Reason for fallback, if any */
  fallbackReason?: string;
  /** Endpoint that was targeted */
  endpoint: RetrievalEvalEndpoint;
  /** Time taken to execute (milliseconds) */
  durationMs: number;
  /** The internal strategy selected by the router (Phase 29-03) */
  selectedMode?: RetrievalStrategy;
  /** Machine-readable reason code for the routing decision (Phase 29-03) */
  routingReason?: RoutingReason;
  /** Whether a fallback strategy was applied after initial selection (Phase 29-03) */
  fallbackApplied: boolean;
}

// =============================================================================
// Normalized Result Types
// =============================================================================

/**
 * Normalized ranked hit from either v1 or v2 response.
 * Provides a common shape for metric calculation.
 */
export interface NormalizedHit {
  /** Entity ID (entryId for v1, capsuleId for v2) */
  id: string;
  /** Ranking score (0-1) */
  score: number;
  /** Match reason/explanation */
  reason: string;
  /** Scope of the result */
  scope: 'global' | 'project';
}

/**
 * Normalized bucket map for v1 responses.
 * Preserves the bucket split for shape assertions.
 */
export interface BucketMap {
  globalConstraints: string[];
  projectKnowledge: string[];
}

/**
 * Normalized result from a single case execution.
 * Endpoint-agnostic shape for scoring and reporting.
 */
export interface NormalizedResult {
  /** All returned hits, sorted by score descending */
  hits: NormalizedHit[];
  /** IDs of all returned results (convenience for metrics) */
  returnedIds: string[];
  /** Bucket map for v1 responses (empty for v2) */
  buckets: BucketMap;
  /** Profile hint artifact IDs for v2 responses (empty for v1) */
  profileHintArtifactIds: string[];
  /** Whether the result was empty */
  isEmpty: boolean;
  /** Raw response for diagnostics (endpoint-specific) */
  rawResponse: unknown;
  /** Endpoint that produced this result */
  endpoint: RetrievalEvalEndpoint;
  /** Routing trace metadata from response */
  routingTrace?: {
    selectedMode: string;
    routingReason: string;
    fallbackApplied: boolean;
    channelsUsed: string[];
  };
}

// =============================================================================
// Governance Check Types
// =============================================================================

/**
 * Governance failure kinds.
 */
export type GovernanceFailureKind = 'forbidden-hit' | 'unexpected-empty' | 'unexpected-non-empty' | 'shape-mismatch';

/**
 * A single governance failure.
 */
export interface GovernanceFailure {
  /** Kind of failure */
  kind: GovernanceFailureKind;
  /** Human-readable description */
  description: string;
  /** IDs involved in the failure (forbidden hits, missing expected, etc.) */
  ids: string[];
}

/**
 * Governance check result for a case.
 */
export interface GovernanceResult {
  /** Whether all governance checks passed */
  passed: boolean;
  /** List of failures, if any */
  failures: GovernanceFailure[];
  /** Forbidden IDs that were found in results */
  forbiddenHits: string[];
}

// =============================================================================
// Metric Types
// =============================================================================

/**
 * Ranking metrics for a single case.
 */
export interface CaseMetrics {
  /** Hit@K for K=1,5,10 */
  hitAt1: number;
  hitAt5: number;
  hitAt10: number;
  /** Mean Reciprocal Rank */
  mrr: number;
  /** Normalized Discounted Cumulative Gain */
  ndcg: number;
  /** Recall@K for K=10 */
  recallAt10: number;
}

/**
 * Slice key for aggregating metrics.
 * Groups results by tier, endpoint, and optional mode.
 */
export interface SliceKey {
  tier: RetrievalEvalTier;
  endpoint: RetrievalEvalEndpoint;
  /** Retrieval mode (v1 only, undefined for v2) */
  mode?: 'semantic' | 'hybrid' | 'graph-assisted';
}

/**
 * Aggregated metrics for a slice.
 * Phase 29-03: EOPS-03 (baseline-aware fields)
 */
export interface SliceMetrics {
  /** Slice key */
  slice: SliceKey;
  /** Number of cases in this slice */
  caseCount: number;
  /** Average Hit@1 */
  avgHitAt1: number;
  /** Average Hit@5 */
  avgHitAt5: number;
  /** Average Hit@10 */
  avgHitAt10: number;
  /** Average MRR */
  avgMrr: number;
  /** Average nDCG */
  avgNdcg: number;
  /** Average Recall@10 */
  avgRecallAt10: number;
  /** Number of governance failures in slice */
  governanceFailures: number;
  /** The internal strategy selected for this slice (Phase 29-03) */
  selectedMode?: RetrievalStrategy;
  /** Whether fallback was applied in this slice (Phase 29-03) */
  fallbackApplied: boolean;
  /** Regression status relative to baseline (Phase 29-03) */
  regressionStatus: 'regressed' | 'stable' | 'improved' | 'no-baseline';
}

// =============================================================================
// Cohort Types (Phase 31-01: EOPS-01)
// =============================================================================

/**
 * Query type tag constants for cohort classification.
 * These canonical tags should be added to case definitions.
 */
export const QUERY_TYPE_TAGS: readonly QueryTypeCohort[] = [
  'error-debugging',
  'how-to',
  'global-constraints',
  'governance-sensitive',
  'general',
] as const;

/**
 * Derive query type cohort from case tags.
 * Returns the first matching query-type tag, or 'general' as default.
 */
export function deriveQueryType(tags: string[]): QueryTypeCohort {
  for (const tag of tags) {
    if (QUERY_TYPE_TAGS.includes(tag as QueryTypeCohort)) {
      return tag as QueryTypeCohort;
    }
  }
  return 'general';
}

/**
 * Derive route family from endpoint.
 * v1 uses 'entry', v2 uses 'capsule', v3 uses 'graph-plan'.
 */
export function deriveRouteFamily(endpoint: string): 'entry' | 'capsule' | 'graph-plan' {
  if (endpoint.startsWith('/v1')) return 'entry';
  if (endpoint.startsWith('/v2')) return 'capsule';
  return 'graph-plan';
}

/**
 * Get a stable string key for a cohort.
 */
export function getCohortKeyString(key: CohortKey): string {
  return `${key.queryType}:${key.routeFamily}`;
}

// =============================================================================
// Mode Comparison Types (Phase 31-02: EOPS-01)
// =============================================================================

/**
 * Get a stable string key for mode comparison grouping.
 * Phase 31-02: EOPS-01
 */
export function getModeComparisonKey(params: {
  clientMode?: 'semantic' | 'hybrid' | 'graph-assisted';
  selectedMode?: string;
  routingReason?: string;
  fallbackApplied: boolean;
}): string {
  const client = params.clientMode ?? 'none';
  const selected = params.selectedMode ?? 'none';
  const reason = params.routingReason ?? 'none';
  const fallback = params.fallbackApplied ? 'fallback' : 'normal';
  return `${client}:${selected}:${reason}:${fallback}`;
}

// =============================================================================
// Case Result Types
// =============================================================================

/**
 * Adapter warning for execution issues.
 */
export interface AdapterWarning {
  /** Warning code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Whether this warning indicates degraded operation */
  degraded: boolean;
}

/**
 * Result of executing a single eval case.
 */
export interface CaseResult {
  /** The case that was executed */
  case: RetrievalEvalCase;
  /** Normalized result from execution */
  result: NormalizedResult;
  /** Execution metadata */
  execution: ExecutionMetadata;
  /** Governance check result */
  governance: GovernanceResult;
  /** Ranking metrics */
  metrics: CaseMetrics;
  /** Whether the case passed (governance + outcome match) */
  passed: boolean;
  /** Any warnings from the adapter */
  warnings: AdapterWarning[];
}

// =============================================================================
// Runner Options and Output Types
// =============================================================================

/**
 * Options for the retrieval eval runner.
 * Phase 29-03: EOPS-03 (baseline options)
 */
export interface RunnerOptions {
  /** Evaluation tier to run */
  tier: RetrievalEvalTier;
  /** Endpoint filter (optional) */
  endpoint?: RetrievalEvalEndpoint;
  /** Whether to produce JSON output */
  json: boolean;
  /** Output path for JSON report (optional) */
  jsonPath?: string;
  /** Whether to allow empty dataset */
  allowEmpty: boolean;
  /** Whether to skip execution (dry-run mode) */
  dryRun: boolean;
  /** Verbosity level (0=quiet, 1=normal, 2=verbose) */
  verbose: number;
  /** Path to baseline report for comparison (Phase 29-03) */
  baselinePath?: string;
  /** Write current results as new baseline (Phase 29-03) */
  writeBaseline?: boolean;
}

/**
 * Runner summary output.
 */
export interface RunnerSummary {
  /** Options used */
  options: RunnerOptions;
  /** All case results */
  caseResults: CaseResult[];
  /** Aggregated slice metrics */
  sliceMetrics: SliceMetrics[];
  /** Total cases run */
  totalCases: number;
  /** Cases passed */
  passedCases: number;
  /** Cases failed */
  failedCases: number;
  /** Overall pass rate */
  passRate: number;
  /** Timestamp of run */
  timestamp: string;
  /** Duration in milliseconds */
  durationMs: number;
}
