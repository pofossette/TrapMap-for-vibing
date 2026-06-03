/**
 * Canonical label catalog repository.
 *
 * Provides CRUD and query operations for canonical labels, aliases,
 * embeddings, and alignment events. This is the truth source for
 * label identity in the semantic merge pipeline.
 *
 * Only PostgreSQL mode is supported (pgvector required for embedding search).
 * No in-memory fallback — label catalog is a server-only feature.
 */

import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import {
  canonicalLabelEmbeddings,
  canonicalLabels,
  labelAlignmentEvents,
  labelAliases,
} from '@trapmap/server/lib/persistence/schema/labels.js';

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
  searchCandidates(normalizedQuery: string, kind?: string, limit?: number): Promise<
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
  upsertEmbedding(canonicalLabelId: string, embedding: number[], contentHash: string): Promise<void>;

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
  mergeCanonicalLabels(
    sourceId: string,
    targetId: string,
  ): Promise<void>;

  /** List all active canonical labels. */
  listActive(kind?: string): Promise<CanonicalLabelRecord[]>;

  /** List aliases for a canonical label. */
  listAliases(canonicalLabelId: string): Promise<LabelAliasRecord[]>;

  /** List alignment events for a raw label. */
  listAlignmentEvents(rawLabel: string): Promise<LabelAlignmentEventRecord[]>;
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

export class PgLabelRepository implements LabelRepository {
  private readonly db;

  constructor(pool: Pool) {
    this.db = drizzle(pool, {
      schema: { canonicalLabels, labelAliases, canonicalLabelEmbeddings, labelAlignmentEvents },
    });
  }

  async findCanonicalById(id: string): Promise<CanonicalLabelRecord | null> {
    const rows = await this.db
      .select()
      .from(canonicalLabels)
      .where(eq(canonicalLabels.id, id))
      .limit(1);
    return rows.length > 0 ? this.toCanonicalRecord(rows[0]!) : null;
  }

  async findCanonicalByAlias(alias: string): Promise<CanonicalLabelRecord | null> {
    const normalized = this.normalize(alias);
    const rows = await this.db
      .select({
        label: canonicalLabels,
      })
      .from(labelAliases)
      .innerJoin(canonicalLabels, eq(labelAliases.canonicalLabelId, canonicalLabels.id))
      .where(eq(labelAliases.normalizedAlias, normalized))
      .limit(1);
    return rows.length > 0 ? this.toCanonicalRecord(rows[0]!.label) : null;
  }

  async upsertCanonicalLabel(label: {
    id: string;
    kind: string;
    canonicalName: string;
    definition?: string | null;
  }): Promise<CanonicalLabelRecord> {
    const normalized = this.normalize(label.canonicalName);
    const now = new Date();
    await this.db
      .insert(canonicalLabels)
      .values({
        id: label.id,
        kind: label.kind,
        canonicalName: label.canonicalName,
        normalizedName: normalized,
        definition: label.definition ?? null,
        status: 'active',
        mergedIntoLabelId: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: canonicalLabels.id,
        set: {
          canonicalName: label.canonicalName,
          normalizedName: normalized,
          definition: label.definition ?? null,
          updatedAt: now,
        },
      });

    return {
      id: label.id,
      kind: label.kind,
      canonicalName: label.canonicalName,
      normalizedName: normalized,
      definition: label.definition ?? null,
      status: 'active',
      mergedIntoLabelId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async upsertAlias(alias: {
    alias: string;
    canonicalLabelId: string;
    source?: 'manual' | 'llm' | 'backfill';
    confidence?: number;
  }): Promise<void> {
    const normalized = this.normalize(alias.alias);
    await this.db
      .insert(labelAliases)
      .values({
        alias: alias.alias,
        normalizedAlias: normalized,
        canonicalLabelId: alias.canonicalLabelId,
        source: alias.source ?? 'manual',
        confidence: alias.confidence ?? 1.0,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: labelAliases.normalizedAlias,
        set: {
          alias: alias.alias,
          canonicalLabelId: alias.canonicalLabelId,
          source: alias.source ?? 'manual',
          confidence: alias.confidence ?? 1.0,
        },
      });
  }

  async searchCandidates(
    normalizedQuery: string,
    kind?: string,
    limit = 5,
  ): Promise<
    Array<{
      label: CanonicalLabelRecord;
      aliases: string[];
      recallReason: 'exact-alias' | 'normalized-name';
    }>
  > {
    const results: Array<{
      label: CanonicalLabelRecord;
      aliases: string[];
      recallReason: 'exact-alias' | 'normalized-name';
    }> = [];

    // 1. Exact alias match
    const aliasRows = await this.db
      .select({
        label: canonicalLabels,
        alias: labelAliases.alias,
      })
      .from(labelAliases)
      .innerJoin(canonicalLabels, eq(labelAliases.canonicalLabelId, canonicalLabels.id))
      .where(
        kind
          ? and(
              eq(labelAliases.normalizedAlias, normalizedQuery),
              eq(canonicalLabels.kind, kind),
              eq(canonicalLabels.status, 'active'),
            )
          : and(
              eq(labelAliases.normalizedAlias, normalizedQuery),
              eq(canonicalLabels.status, 'active'),
            ),
      )
      .limit(limit);

    const seenIds = new Set<string>();
    for (const row of aliasRows) {
      const label = this.toCanonicalRecord(row.label);
      if (seenIds.has(label.id)) continue;
      seenIds.add(label.id);
      // Fetch all aliases for this label
      const allAliases = await this.db
        .select({ alias: labelAliases.alias })
        .from(labelAliases)
        .where(eq(labelAliases.canonicalLabelId, label.id));
      results.push({
        label,
        aliases: allAliases.map((a) => a.alias),
        recallReason: 'exact-alias',
      });
    }

    // 2. Normalized name prefix/suffix match (if we haven't hit limit)
    if (results.length < limit) {
      const remaining = limit - results.length;
      const excludeIds = [...seenIds];
      const nameCondition = kind
        ? and(
            sql`${canonicalLabels.normalizedName} LIKE ${`%${normalizedQuery}%`}`,
            eq(canonicalLabels.kind, kind),
            eq(canonicalLabels.status, 'active'),
            excludeIds.length > 0
              ? sql`${canonicalLabels.id} NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`
              : sql`TRUE`,
          )
        : and(
            sql`${canonicalLabels.normalizedName} LIKE ${`%${normalizedQuery}%`}`,
            eq(canonicalLabels.status, 'active'),
            excludeIds.length > 0
              ? sql`${canonicalLabels.id} NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`
              : sql`TRUE`,
          );

      const nameRows = await this.db
        .select()
        .from(canonicalLabels)
        .where(nameCondition)
        .limit(remaining);

      for (const row of nameRows) {
        const label = this.toCanonicalRecord(row);
        if (seenIds.has(label.id)) continue;
        seenIds.add(label.id);
        const allAliases = await this.db
          .select({ alias: labelAliases.alias })
          .from(labelAliases)
          .where(eq(labelAliases.canonicalLabelId, label.id));
        results.push({
          label,
          aliases: allAliases.map((a) => a.alias),
          recallReason: 'normalized-name',
        });
      }
    }

    return results;
  }

  async searchCandidatesByEmbedding(
    embedding: number[],
    kind?: string,
    limit = 5,
  ): Promise<Array<{ label: CanonicalLabelRecord; distance: number }>> {
    // Use pgvector cosine distance operator
    const vectorStr = `[${embedding.join(',')}]`;

    let query = sql`
      SELECT cl.*, cle.vector <=> ${vectorStr}::vector AS distance
      FROM canonical_label_embeddings cle
      INNER JOIN canonical_labels cl ON cl.id = cle.canonical_label_id
      WHERE cl.status = 'active'
    `;

    if (kind) {
      query = sql`
        SELECT cl.*, cle.vector <=> ${vectorStr}::vector AS distance
        FROM canonical_label_embeddings cle
        INNER JOIN canonical_labels cl ON cl.id = cle.canonical_label_id
        WHERE cl.status = 'active' AND cl.kind = ${kind}
      `;
    }

    query = sql`${query} ORDER BY distance ASC LIMIT ${limit}`;

    const result = await this.db.execute(query);
    return result.rows.map((row: Record<string, unknown>) => ({
      label: {
        id: row.id as string,
        kind: row.kind as string,
        canonicalName: row.canonical_name as string,
        normalizedName: row.normalized_name as string,
        definition: row.definition as string | null,
        status: row.status as 'active' | 'merged' | 'disabled',
        mergedIntoLabelId: row.merged_into_label_id as string | null,
        createdAt: (row.created_at as Date).toISOString(),
        updatedAt: (row.updated_at as Date).toISOString(),
      },
      distance: row.distance as number,
    }));
  }

  async upsertEmbedding(
    canonicalLabelId: string,
    embedding: number[],
    contentHash: string,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(canonicalLabelEmbeddings)
      .values({
        canonicalLabelId,
        vector: embedding,
        contentHash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: canonicalLabelEmbeddings.canonicalLabelId,
        set: {
          vector: embedding,
          contentHash,
          updatedAt: now,
        },
      });
  }

  async recordAlignmentEvent(event: {
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
  }): Promise<void> {
    await this.db.insert(labelAlignmentEvents).values({
      id: event.id,
      rawLabel: event.rawLabel,
      rawEvidence: event.rawEvidence,
      decision: event.decision,
      canonicalLabelId: event.canonicalLabelId ?? null,
      canonicalName: event.canonicalName ?? null,
      confidence: event.confidence,
      reasoning: event.reasoning,
      candidateSnapshot: event.candidateSnapshot ?? [],
      sourceContext: event.sourceContext ?? 'extraction',
      createdAt: new Date(),
    });
  }

  async mergeCanonicalLabels(sourceId: string, targetId: string): Promise<void> {
    const now = new Date();
    // 1. Mark source as merged
    await this.db
      .update(canonicalLabels)
      .set({
        status: 'merged',
        mergedIntoLabelId: targetId,
        updatedAt: now,
      })
      .where(eq(canonicalLabels.id, sourceId));

    // 2. Re-point all aliases from source to target
    await this.db
      .update(labelAliases)
      .set({ canonicalLabelId: targetId })
      .where(eq(labelAliases.canonicalLabelId, sourceId));
  }

  async listActive(kind?: string): Promise<CanonicalLabelRecord[]> {
    const query = kind
      ? and(eq(canonicalLabels.status, 'active'), eq(canonicalLabels.kind, kind))
      : eq(canonicalLabels.status, 'active');
    const rows = await this.db.select().from(canonicalLabels).where(query);
    return rows.map((r) => this.toCanonicalRecord(r));
  }

  async listAliases(canonicalLabelId: string): Promise<LabelAliasRecord[]> {
    const rows = await this.db
      .select()
      .from(labelAliases)
      .where(eq(labelAliases.canonicalLabelId, canonicalLabelId));
    return rows.map((r) => ({
      alias: r.alias,
      normalizedAlias: r.normalizedAlias,
      canonicalLabelId: r.canonicalLabelId,
      source: r.source as 'manual' | 'llm' | 'backfill',
      confidence: r.confidence,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listAlignmentEvents(rawLabel: string): Promise<LabelAlignmentEventRecord[]> {
    const rows = await this.db
      .select()
      .from(labelAlignmentEvents)
      .where(eq(labelAlignmentEvents.rawLabel, rawLabel))
      .orderBy(labelAlignmentEvents.createdAt);
    return rows.map((r) => ({
      id: r.id,
      rawLabel: r.rawLabel,
      rawEvidence: r.rawEvidence,
      decision: r.decision as 'existing' | 'new' | 'unsure',
      canonicalLabelId: r.canonicalLabelId,
      canonicalName: r.canonicalName,
      confidence: r.confidence,
      reasoning: r.reasoning,
      candidateSnapshot: (r.candidateSnapshot ?? []) as Array<{
        id: string;
        canonicalName: string;
        recallReason: string;
      }>,
      sourceContext: r.sourceContext,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalize(value: string): string {
    return value.toLowerCase().trim().replace(/\s+/g, '-');
  }

  private toCanonicalRecord(row: {
    id: string;
    kind: string;
    canonicalName: string;
    normalizedName: string;
    definition: string | null;
    status: string;
    mergedIntoLabelId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CanonicalLabelRecord {
    return {
      id: row.id,
      kind: row.kind,
      canonicalName: row.canonicalName,
      normalizedName: row.normalizedName,
      definition: row.definition,
      status: row.status as 'active' | 'merged' | 'disabled',
      mergedIntoLabelId: row.mergedIntoLabelId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a LabelRepository. Requires a PostgreSQL pool (pgvector is mandatory).
 */
export function createLabelRepository(config: { pool: Pool }): LabelRepository {
  return new PgLabelRepository(config.pool);
}
