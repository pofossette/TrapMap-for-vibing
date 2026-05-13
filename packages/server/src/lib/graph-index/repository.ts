/**
 * Repository interface and implementations for graph index document persistence.
 *
 * This module provides:
 * - GraphIndexRepository interface for graph document CRUD operations
 * - InMemoryGraphIndexRepository implementation using SkillShareerStore
 * - Factory function for repository creation
 *
 * Phase: 100-02 (Store Repository Pattern)
 */

import type { Pool } from 'pg';

import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';
import type { SkillShareerStore } from '../store.js';

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
 * Factory function to create the appropriate GraphIndexRepository.
 * Returns InMemoryGraphIndexRepository (Pg implementation to be added in future phase).
 */
export function createGraphIndexRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): GraphIndexRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgGraphIndexRepository(config.pool);
  //   return new DualWriteGraphIndexRepository(pgRepo, config.store);
  // }
  return new InMemoryGraphIndexRepository(config.store);
}
