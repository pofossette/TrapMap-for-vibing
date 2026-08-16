/**
 * Shared types for live retrieval evaluation.
 *
 * Extends offline eval types with live-specific metadata:
 * snapshot version, backend connection, index health.
 */

import type {
  AssertionStability,
  LiveEvalServiceProfile,
  LiveSnapshotDerivationMode,
} from '../../types/index.js';
import type { RetrievalEvalCase, RetrievalEvalEndpoint } from '../../types/index.js';

import type {
  AdapterWarning,
  CaseMetrics,
  GovernanceResult,
  NormalizedResult,
} from '../../retrieval/lib/types.js';

// Re-export for convenience
export type { AdapterWarning, CaseMetrics, GovernanceResult, NormalizedResult };

/**
 * A live eval case extends the base retrieval case with stability classification.
 */
export interface LiveEvalCase extends RetrievalEvalCase {
  /** Stability tag for assertions */
  stability: AssertionStability;
}

/**
 * Execution metadata for a live eval case run against a real backend.
 */
export interface LiveExecutionMetadata {
  /** Backend URL that served the request */
  backendBaseUrl: string;
  /** HTTP status code */
  statusCode: number;
  /** Request duration in milliseconds */
  durationMs: number;
  /** Endpoint that was targeted */
  endpoint: RetrievalEvalEndpoint;
  /** Routing trace from response (if available) */
  routingTrace?: NormalizedResult['routingTrace'];
  /** Fallback was applied (v3 only) */
  fallbackApplied: boolean;
}

/**
 * Result of executing a single live eval case.
 */
export interface LiveCaseResult {
  /** The case that was executed */
  case: LiveEvalCase;
  /** Normalized result from the backend */
  result: NormalizedResult;
  /** Execution metadata */
  execution: LiveExecutionMetadata;
  /** Governance check result */
  governance: GovernanceResult;
  /** Ranking metrics */
  metrics: CaseMetrics;
  /** Whether the case passed (only stable assertions cause failure) */
  passed: boolean;
  /** Any warnings from execution */
  warnings: AdapterWarning[];
}

/**
 * Snapshot orchestrator options.
 */
export interface SnapshotOrchestratorOptions {
  /** PostgreSQL connection URL for the test database */
  databaseUrl: string;
  /** Path to the snapshot directory (contains meta.json + corpus.json) */
  snapshotDir: string;
  /** Whether to verify service profile matches snapshot expectations */
  verifyProfile?: boolean;
}

/**
 * Health check result after snapshot restore.
 */
export interface IndexHealthSummary {
  knowledgeEntryCount: number;
  skillArtifactCount: number;
  graphDocCount: number;
  capsuleEmbeddingCount: number;
  graphProjectionHealthy: boolean;
}

/**
 * Backend client options.
 */
export interface BackendClientOptions {
  /** Base URL of the live TrapMap service */
  baseUrl: string;
  /** Auth token for the eval runner session */
  authToken: string;
}

/**
 * Live eval runner options.
 */
export interface LiveRunnerOptions {
  /** Snapshot version name */
  snapshotVersion: string;
  /** Base URL of the live backend */
  baseUrl: string;
  /** Evaluation tier */
  tier: 'smoke' | 'core';
  /** Endpoint filter */
  endpoint?: RetrievalEvalEndpoint;
  /** Dry run mode */
  dryRun: boolean;
  /** Allow empty dataset */
  allowEmpty: boolean;
  /** JSON output */
  json: boolean;
  /** JSON output path */
  jsonPath?: string;
  /** Verbosity level */
  verbose: number;
  /** PostgreSQL URL for snapshot restore */
  databaseUrl: string;
  /** Auth token for backend requests */
  authToken: string;
}
