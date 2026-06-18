/**
 * Retrieval query orchestration use-case patterns.
 *
 * Defines the host-agnostic orchestration patterns for retrieval
 * queries. These describe the shape of retrieval operations
 * without prescribing the recall channels or scoring strategies.
 */

// ---------------------------------------------------------------------------
// Retrieval query input
// ---------------------------------------------------------------------------

export interface RetrievalQueryInput {
  query: string;
  teamId?: string;
  limit?: number;
  channel?: 'semantic' | 'hybrid' | 'graph-assisted';
  filters?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Retrieval query result
// ---------------------------------------------------------------------------

export interface RetrievalResultEntry {
  entryId: string;
  title: string;
  score: number;
  snippet?: string;
  labels: string[];
  lifecycleState: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalQueryResult {
  results: RetrievalResultEntry[];
  channel: string;
  totalEstimate?: number;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Retrieval orchestration contract
// ---------------------------------------------------------------------------

/**
 * The shape of a retrieval orchestration use-case.
 * Implements multi-channel recall and scoring coordination.
 */
export interface RetrievalOrchestrator {
  /**
   * Execute a retrieval query across available recall channels.
   */
  search(input: RetrievalQueryInput): Promise<RetrievalQueryResult>;

  /**
   * Execute a structured retrieval plan (multi-step search).
   */
  plan?(input: RetrievalQueryInput): Promise<unknown>;
}
