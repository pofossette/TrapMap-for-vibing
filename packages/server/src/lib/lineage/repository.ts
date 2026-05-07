/**
 * Repository interface and implementations for entity lineage persistence.
 *
 * This module provides:
 * - LineageRepository interface for lineage CRUD operations
 * - InMemoryLineageRepository implementation using SkillShareerStore
 * - Factory function for repository creation
 *
 * Phase: 100-02 (Store Repository Pattern)
 */

import type { Pool } from 'pg';

import type { EntityLineageRecord, SkillShareerStore } from '../store.js';

/**
 * Repository interface for entity lineage CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface LineageRepository {
  /**
   * Insert a new lineage record.
   */
  insert(lineage: EntityLineageRecord): Promise<void>;

  /**
   * Get a lineage record by its ID.
   * Returns null if the lineage does not exist.
   */
  getById(lineageId: string): Promise<EntityLineageRecord | null>;

  /**
   * List lineage records by source type and source ID.
   */
  listBySource(sourceType: string, sourceId: string): Promise<EntityLineageRecord[]>;

  /**
   * List lineage records by target type and target ID.
   */
  listByTarget(targetType: string, targetId: string): Promise<EntityLineageRecord[]>;

  /**
   * List lineage records for a specific candidate.
   */
  listByCandidate(candidateId: string): Promise<EntityLineageRecord[]>;
}

/**
 * In-memory repository that uses SkillShareerStore for all lineage operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryLineageRepository implements LineageRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(lineage: EntityLineageRecord): Promise<void> {
    await this.store.transact((data) => {
      data.entityLineage.push(lineage);
    });
  }

  async getById(lineageId: string): Promise<EntityLineageRecord | null> {
    const data = await this.store.snapshot();
    return data.entityLineage.find((l) => l.id === lineageId) ?? null;
  }

  async listBySource(sourceType: string, sourceId: string): Promise<EntityLineageRecord[]> {
    const data = await this.store.snapshot();
    return data.entityLineage.filter(
      (l) => l.sourceType === sourceType && l.sourceId === sourceId,
    );
  }

  async listByTarget(targetType: string, targetId: string): Promise<EntityLineageRecord[]> {
    const data = await this.store.snapshot();
    return data.entityLineage.filter(
      (l) => l.targetType === targetType && l.targetId === targetId,
    );
  }

  async listByCandidate(candidateId: string): Promise<EntityLineageRecord[]> {
    const data = await this.store.snapshot();
    return data.entityLineage.filter((l) => l.candidateId === candidateId);
  }
}

/**
 * Factory function to create the appropriate LineageRepository.
 * Returns InMemoryLineageRepository (Pg implementation to be added in future phase).
 */
export function createLineageRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): LineageRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgLineageRepository(config.pool);
  //   return new DualWriteLineageRepository(pgRepo, config.store);
  // }
  return new InMemoryLineageRepository(config.store);
}
