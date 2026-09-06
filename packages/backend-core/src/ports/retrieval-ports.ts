/**
 * Retrieval read-model port interfaces.
 *
 * These ports define the contract for retrieval query orchestration
 * and read-model projection. Host assemblies provide concrete
 * implementations backed by the retrieval pipeline.
 */

import type { RetrievalResponse } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Retrieval query port
// ---------------------------------------------------------------------------

export interface RetrievalSearchParams {
  query: string;
  teamId?: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export type ReadModelConsistency = 'strong' | 'eventual';
export type ReadModelFreshness = 'current' | 'refresh-pending' | 'degraded';
export type ReadModelFallback = 'none' | 'direct-authoritative-read';
export type ReadModelSurfaceOwner = 'knowledge-read' | 'governance-review';
export type ReadModelSurfaceSource =
  | 'temporary-direct-backed-projection'
  | 'temporary-direct-backed-operator-projection'
  | 'derived-projection'
  | 'derived-search-index'
  | 'derived-query-trace'
  | 'governance-read-model';

export interface ReadModelSurfaceStatus {
  surface: string;
  owner: ReadModelSurfaceOwner;
  providedBy: ReadModelSurfaceOwner;
  source: ReadModelSurfaceSource;
  authoritativeSource: string;
  consistency: ReadModelConsistency;
  freshness: ReadModelFreshness;
  fallback: ReadModelFallback;
  notes?: string;
  exitCriteria?: string;
}

export interface ReadModelProjectionStatus {
  phase: 'phase-2-boundary-closed';
  source: string;
  consistency: ReadModelConsistency;
  freshness: ReadModelFreshness;
  fallback: ReadModelFallback;
  /** Most recent successful rebuild of the owner projection. */
  lastRefreshedAt?: string;
  /** Time since an invalidation that has not yet been rebuilt. */
  lagMs?: number;
  /** Stable source that tells operators how refreshes are initiated. */
  refreshTrigger?: string;
  notes?: string;
  surfaces: ReadModelSurfaceStatus[];
}

export interface RetrievalQueryPort {
  /**
   * Execute a retrieval search across available recall channels.
   *
   * Returns the full contract `RetrievalResponse` (matches, refinement,
   * summary) so gateway v1/v3 surfaces can forward it verbatim to CLI
   * consumers. Callers needing a reduced row view project from
   * `globalConstraints` / `projectKnowledge` themselves.
   */
  search(params: RetrievalSearchParams): Promise<RetrievalResponse>;

  /**
   * Execute a retrieval plan (structured multi-step search).
   */
  plan?(params: RetrievalSearchParams): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Read-model projection port
// ---------------------------------------------------------------------------

/**
 * A read-model projection port allows host assemblies to maintain
 * materialized views of domain data. Implementations may use
 * in-memory caches, database views, or event-sourced projections.
 */
export interface ReadModelProjectionPort<TQuery, TResult> {
  /**
   * Query the read model.
   */
  query(params: TQuery): Promise<TResult>;

  /**
   * Refresh the read model from the source of truth.
   * Implementations may no-op if the read model is always consistent.
   */
  refresh?(): Promise<void>;
}

export interface KnowledgeReadProjectionPort<TEntry> {
  getById(entryId: string): Promise<TEntry | null>;
  listMine(params: { userId: string; teamId?: string }): Promise<TEntry[]>;
  getStatus(): Promise<ReadModelProjectionStatus>;
  rebuild?(): Promise<void>;
}
