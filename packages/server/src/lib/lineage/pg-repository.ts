/**
 * PostgreSQL-backed implementation of LineageRepository.
 *
 * Uses structured entity_lineage table instead of in-memory arrays
 * in store_snapshot JSONB.
 *
 * Round 5: Structural Refactoring
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { entityLineage } from '@trapmap/server/lib/persistence/schema.js';
import type { EntityLineageRecord } from '@trapmap/server/lib/store.js';
import type { LineageRepository } from './repository.js';

/**
 * PostgreSQL-backed repository for entity lineage CRUD operations.
 */
export class PgLineageRepository implements LineageRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema: { entityLineage } });
  }

  async insert(lineage: EntityLineageRecord): Promise<void> {
    await this.db.insert(entityLineage).values({
      id: lineage.id,
      candidateId: lineage.candidateId,
      relationshipType: lineage.relationshipType,
      sourceType: lineage.sourceType,
      sourceId: lineage.sourceId,
      targetType: lineage.targetType,
      targetId: lineage.targetId,
      createdAt: new Date(lineage.createdAt),
      notes: lineage.notes,
    });
  }

  async getById(lineageId: string): Promise<EntityLineageRecord | null> {
    const result = await this.db
      .select()
      .from(entityLineage)
      .where(eq(entityLineage.id, lineageId))
      .limit(1);

    if (result.length === 0) return null;
    return rowToEntityLineage(result[0]!);
  }

  async listBySource(sourceType: string, sourceId: string): Promise<EntityLineageRecord[]> {
    const result = await this.db
      .select()
      .from(entityLineage)
      .where(and(eq(entityLineage.sourceType, sourceType), eq(entityLineage.sourceId, sourceId)));

    return result.map(rowToEntityLineage);
  }

  async listByTarget(targetType: string, targetId: string): Promise<EntityLineageRecord[]> {
    const result = await this.db
      .select()
      .from(entityLineage)
      .where(and(eq(entityLineage.targetType, targetType), eq(entityLineage.targetId, targetId)));

    return result.map(rowToEntityLineage);
  }

  async listByCandidate(candidateId: string): Promise<EntityLineageRecord[]> {
    const result = await this.db
      .select()
      .from(entityLineage)
      .where(eq(entityLineage.candidateId, candidateId));

    return result.map(rowToEntityLineage);
  }
}

// =============================================================================
// Helpers
// =============================================================================

interface EntityLineageRow {
  id: string;
  candidateId: string;
  relationshipType: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  createdAt: Date;
  notes: string | null;
}

function rowToEntityLineage(row: EntityLineageRow): EntityLineageRecord {
  return {
    id: row.id,
    candidateId: row.candidateId,
    relationshipType: row.relationshipType as 'published_as' | 'merged_into',
    sourceType: row.sourceType as 'candidate' | 'trap' | 'skill',
    sourceId: row.sourceId,
    targetType: row.targetType as 'trap' | 'skill',
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
    notes: row.notes,
  };
}
