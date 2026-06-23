/**
 * Retrieval read-model port interfaces.
 *
 * These ports define the contract for retrieval query orchestration
 * and read-model projection. Host assemblies provide concrete
 * implementations backed by the retrieval pipeline.
 */

// ---------------------------------------------------------------------------
// Retrieval query port
// ---------------------------------------------------------------------------

export interface RetrievalSearchParams {
  query: string;
  teamId?: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface RetrievalSearchResult {
  entryId: string;
  score: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalSearchResponse {
  results: RetrievalSearchResult[];
  totalEstimate?: number;
  channel?: string;
  latencyMs?: number;
}

export type ReadModelConsistency = 'strong' | 'eventual';

export interface ReadModelProjectionStatus {
  source: string;
  consistency: ReadModelConsistency;
  freshness: 'current' | 'stale' | 'refreshing';
  fallback: 'none' | 'direct-authoritative-read';
  notes?: string;
}

export interface RetrievalQueryPort {
  /**
   * Execute a retrieval search across available recall channels.
   */
  search(params: RetrievalSearchParams): Promise<RetrievalSearchResponse>;

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
}
