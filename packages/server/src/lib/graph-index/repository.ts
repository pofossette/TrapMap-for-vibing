/**
 * Repository interface and implementations for graph index document persistence.
 *
 * This module provides:
 * - GraphIndexRepository interface for graph document CRUD operations
 * - InMemoryGraphIndexRepository implementation using SkillShareerStore
 * - PgGraphIndexRepository implementation using PostgreSQL
 * - Factory function for repository creation
 *
 * Phase: 100-02 (Store Repository Pattern)
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import { graphIndexDocuments } from '@trapmap/server/lib/persistence/schema.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

/**
 * Repository interface for graph index document CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface GraphIndexRepository {
  /**
   * Insert a new graph index document.
   */
  insert(doc: GraphIndexDocumentRecord): Promise<void>;

  /**
   * Get a graph index document by its ID.
   * Returns null if the document does not exist.
   */
  getById(docId: string): Promise<GraphIndexDocumentRecord | null>;

  /**
   * List graph index documents by source type and source ID.
   */
  listBySource(sourceType: string, sourceId: string): Promise<GraphIndexDocumentRecord[]>;

  /**
   * List all graph index documents.
   */
  listAll(): Promise<GraphIndexDocumentRecord[]>;

  /**
   * Upsert a graph index document.
   * Replaces existing document with same ID, or inserts if new.
   */
  upsert(doc: GraphIndexDocumentRecord): Promise<void>;

  /**
   * Remove a graph index document by its ID.
   */
  remove(docId: string): Promise<void>;

  /**
   * Remove all graph index documents for a given source.
   * Used during deactivation or when a source is no longer approved.
   */
  removeBySource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void>;
}

/**
 * In-memory repository that uses SkillShareerStore for all graph index operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryGraphIndexRepository implements GraphIndexRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(doc: GraphIndexDocumentRecord): Promise<void> {
    await this.store.transact((data) => {
      data.graphIndexDocuments.push(doc);
    });
  }

  async getById(docId: string): Promise<GraphIndexDocumentRecord | null> {
    const data = await this.store.snapshot();
    return data.graphIndexDocuments.find((d) => d.id === docId) ?? null;
  }

  async listBySource(sourceType: string, sourceId: string): Promise<GraphIndexDocumentRecord[]> {
    const data = await this.store.snapshot();
    return data.graphIndexDocuments.filter(
      (d) => d.sourceType === sourceType && d.sourceId === sourceId,
    );
  }

  async listAll(): Promise<GraphIndexDocumentRecord[]> {
    const data = await this.store.snapshot();
    return data.graphIndexDocuments;
  }

  async upsert(doc: GraphIndexDocumentRecord): Promise<void> {
    await this.store.transact((data) => {
      const idx = data.graphIndexDocuments.findIndex((d) => d.id === doc.id);
      if (idx >= 0) {
        data.graphIndexDocuments[idx] = doc;
      } else {
        data.graphIndexDocuments.push(doc);
      }
    });
  }

  async remove(docId: string): Promise<void> {
    await this.store.transact((data) => {
      data.graphIndexDocuments = data.graphIndexDocuments.filter((d) => d.id !== docId);
    });
  }

  async removeBySource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.store.transact((data) => {
      data.graphIndexDocuments = data.graphIndexDocuments.filter(
        (d) => !(d.sourceType === sourceType && d.sourceId === sourceId),
      );
    });
  }
}

/**
 * PostgreSQL repository for graph index document persistence.
 * Uses the graph_index_documents table with JSONB nodes/edges columns.
 */
export class PgGraphIndexRepository implements GraphIndexRepository {
  private readonly db;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema: { graphIndexDocuments } });
  }

  async insert(doc: GraphIndexDocumentRecord): Promise<void> {
    await this.db.insert(graphIndexDocuments).values({
      id: doc.id,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      revisionNo: doc.revision,
      contentHash: doc.contentHash,
      teamId: doc.teamId,
      scope: doc.scope,
      requiredLevel: doc.requiredLevel,
      nodes: doc.nodes,
      edges: doc.edges,
      evidence: doc.evidence,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    });
  }

  async getById(docId: string): Promise<GraphIndexDocumentRecord | null> {
    const rows = await this.db
      .select()
      .from(graphIndexDocuments)
      .where(eq(graphIndexDocuments.id, docId))
      .limit(1);
    if (rows.length === 0) return null;
    return this.toRecord(rows[0]!);
  }

  async listBySource(sourceType: string, sourceId: string): Promise<GraphIndexDocumentRecord[]> {
    const rows = await this.db
      .select()
      .from(graphIndexDocuments)
      .where(
        and(
          eq(graphIndexDocuments.sourceType, sourceType),
          eq(graphIndexDocuments.sourceId, sourceId),
        ),
      );
    return rows.map((r) => this.toRecord(r));
  }

  async listAll(): Promise<GraphIndexDocumentRecord[]> {
    const rows = await this.db.select().from(graphIndexDocuments);
    return rows.map((r) => this.toRecord(r));
  }

  async upsert(doc: GraphIndexDocumentRecord): Promise<void> {
    await this.db
      .insert(graphIndexDocuments)
      .values({
        id: doc.id,
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        revisionNo: doc.revision,
        contentHash: doc.contentHash,
        teamId: doc.teamId,
        scope: doc.scope,
        requiredLevel: doc.requiredLevel,
        nodes: doc.nodes,
        edges: doc.edges,
        evidence: doc.evidence,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt),
      })
      .onConflictDoUpdate({
        target: graphIndexDocuments.id,
        set: {
          contentHash: doc.contentHash,
          nodes: doc.nodes,
          edges: doc.edges,
          evidence: doc.evidence,
          updatedAt: new Date(doc.updatedAt),
        },
      });
  }

  async remove(docId: string): Promise<void> {
    await this.db.delete(graphIndexDocuments).where(eq(graphIndexDocuments.id, docId));
  }

  async removeBySource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.db
      .delete(graphIndexDocuments)
      .where(
        and(
          eq(graphIndexDocuments.sourceType, sourceType),
          eq(graphIndexDocuments.sourceId, sourceId),
        ),
      );
  }

  private toRecord(row: {
    id: string;
    sourceType: string;
    sourceId: string;
    revisionNo: number;
    contentHash: string;
    teamId: string | null;
    scope: string;
    requiredLevel: number;
    nodes: Array<{ id: string; kind: string; label: string; evidence: string }>;
    edges: Array<{
      id: string;
      sourceNodeId: string;
      targetNodeId: string;
      relationType: string;
      strength: string;
      evidence: string;
    }>;
    evidence: string;
    createdAt: Date;
    updatedAt: Date;
  }): GraphIndexDocumentRecord {
    return {
      id: row.id,
      sourceType: row.sourceType as 'trap' | 'skill',
      sourceId: row.sourceId,
      revision: row.revisionNo,
      contentHash: row.contentHash,
      teamId: row.teamId,
      scope: row.scope as 'global' | 'project',
      requiredLevel: row.requiredLevel,
      nodes: row.nodes as unknown as GraphNodeRecord[],
      edges: row.edges as unknown as GraphEdgeRecord[],
      evidence: row.evidence,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/**
 * Factory function to create the appropriate GraphIndexRepository.
 * Returns PgGraphIndexRepository when a pool is available, InMemory otherwise.
 */
export function createGraphIndexRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): GraphIndexRepository {
  if (config.pool) {
    return new PgGraphIndexRepository(config.pool);
  }
  return new InMemoryGraphIndexRepository(config.store);
}
