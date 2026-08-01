/**
 * Record types and interface for the canonical label catalog repository.
 *
 * These types define the shape of canonical labels, aliases,
 * alignment events, and the repository contract used by the
 * semantic merge pipeline.
 */

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface CanonicalLabelRecord {
  id: string;
  kind: string;
  canonicalName: string;
  normalizedName: string;
  definition: string | null;
  status: 'active' | 'merged' | 'disabled';
  mergedIntoLabelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabelAliasRecord {
  alias: string;
  normalizedAlias: string;
  canonicalLabelId: string;
  source: 'manual' | 'llm' | 'backfill';
  confidence: number;
  createdAt: string;
}

export interface LabelAlignmentEventRecord {
  id: string;
  rawLabel: string;
  rawEvidence: string;
  decision: 'existing' | 'new' | 'unsure';
  canonicalLabelId: string | null;
  canonicalName: string | null;
  confidence: number;
  reasoning: string;
  candidateSnapshot: Array<{ id: string; canonicalName: string; recallReason: string }>;
  sourceContext: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LabelRepository {
  /** Find a canonical label by its ID. */
  findCanonicalById(id: string): Promise<CanonicalLabelRecord | null>;

  /** Find a canonical label by an exact alias match. */
  findCanonicalByAlias(alias: string): Promise<CanonicalLabelRecord | null>;

  /** Create or update a canonical label. Returns the label. */
  upsertCanonicalLabel(label: {
    id: string;
    kind: string;
    canonicalName: string;
    definition?: string | null;
  }): Promise<CanonicalLabelRecord>;

  /** Upsert an alias for a canonical label. */
  upsertAlias(alias: {
    alias: string;
    canonicalLabelId: string;
    source?: 'manual' | 'llm' | 'backfill';
    confidence?: number;
  }): Promise<void>;

  /** Search candidate labels by normalized name prefix or exact alias. */
  searchCandidates(
    normalizedQuery: string,
    kind?: string,
    limit?: number,
  ): Promise<
    Array<{
      label: CanonicalLabelRecord;
      aliases: string[];
      recallReason: 'exact-alias' | 'normalized-name';
    }>
  >;

  /** Search candidate labels by embedding similarity. */
  searchCandidatesByEmbedding(
    embedding: number[],
    kind?: string,
    limit?: number,
  ): Promise<
    Array<{
      label: CanonicalLabelRecord;
      distance: number;
    }>
  >;

  /** Store or update a label embedding. */
  upsertEmbedding(
    canonicalLabelId: string,
    embedding: number[],
    contentHash: string,
  ): Promise<void>;

  /** Record an alignment event. */
  recordAlignmentEvent(event: {
    id: string;
    rawLabel: string;
    rawEvidence: string;
    decision: 'existing' | 'new' | 'unsure';
    canonicalLabelId?: string | null;
    canonicalName?: string | null;
    confidence: number;
    reasoning: string;
    candidateSnapshot?: Array<{ id: string; canonicalName: string; recallReason: string }>;
    sourceContext?: string;
  }): Promise<void>;

  /** Merge one canonical label into another (soft merge). */
  mergeCanonicalLabels(sourceId: string, targetId: string): Promise<void>;

  /** List all active canonical labels. */
  listActive(kind?: string): Promise<CanonicalLabelRecord[]>;

  /** List aliases for a canonical label. */
  listAliases(canonicalLabelId: string): Promise<LabelAliasRecord[]>;

  /** List alignment events for a raw label. */
  listAlignmentEvents(rawLabel: string): Promise<LabelAlignmentEventRecord[]>;
}
