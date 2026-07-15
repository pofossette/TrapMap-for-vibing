/**
 * Repository interface and implementations for knowledge entry persistence.
 *
 * This module provides:
 * - KnowledgeRepository interface abstracting CRUD operations
 * - InMemoryKnowledgeRepository for tests without PostgreSQL
 * - Factory function for repository selection
 *
 * Phase: 62 (WRITE-02) — Round 2: DualWrite removed, PG-only when pool available.
 *
 * store_snapshot is no longer used for knowledge reads/writes.
 * Remaining non-knowledge domains without PG tables (users, teams, etc.)
 * will be addressed in later rounds.
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type {
  EmbeddingCacheRecord,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  SkillShareerStore,
} from '@trapmap/server/lib/store.js';
import { PgKnowledgeRepository } from './pg-repository.js';

/**
 * Repository interface for knowledge entry CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 *
 * This interface enables the dual-write pattern during transition
 * from JSONB snapshot storage to row-level PostgreSQL tables.
 */
export interface KnowledgeRepository {
  /**
   * Generate a new unique knowledge entry ID.
   * Uses PostgreSQL SEQUENCE for monotonic ID generation.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new knowledge entry.
   * The entry ID should be pre-generated via nextId().
   */
  insert(entry: KnowledgeRecord): Promise<void>;

  /**
   * Get a knowledge entry by its ID.
   * Returns null if the entry does not exist.
   */
  getById(entryId: string): Promise<KnowledgeRecord | null>;

  /**
   * Get multiple knowledge entries by ID.
   * Implementations should preserve the caller's requested ID order.
   */
  getByIds?(entryIds: string[]): Promise<KnowledgeRecord[]>;

  /**
   * Update the lifecycle state of an entry.
   * Uses SELECT FOR UPDATE for row-level locking.
   * Validates transition using state machine.
   * Returns the updated entry record with appended lifecycle history.
   * Throws error if entry not found or invalid transition.
   */
  updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<KnowledgeRecord>;

  /**
   * Append a new revision to an entry.
   * Updates the latest_revision columns on the entry.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void>;

  /**
   * Append a lifecycle event to an entry's history.
   */
  appendLifecycleEvent(entryId: string, event: KnowledgeLifecycleEventRecord): Promise<void>;

  /**
   * List entries by filter criteria.
   * Returns lightweight records without full revision history.
   * Round 3: Supports label filtering (ALL labels must match).
   */
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    labels?: string[];
  }): Promise<KnowledgeRecord[]>;

  /**
   * Update governance fields on an entry.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void>;

  /**
   * Update the embedding cache for a knowledge entry.
   * Persists the pre-computed embedding vector and associated metadata.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  updateEmbeddingCache(entryId: string, cache: EmbeddingCacheRecord): Promise<void>;

  supersede(
    entryId: string,
    input: { replacementId: string; actorId: string },
  ): Promise<KnowledgeRecord>;

  /**
   * Persist a full aggregate snapshot via the repository seam.
   * Structured fields remain authoritative in repo-owned storage; compatibility
   * shadow writes stay encapsulated inside repository implementations.
   */
  save?(entry: KnowledgeRecord): Promise<void>;
}

// Round 2: DualWriteKnowledgeRepository removed.
// Writes go exclusively to PostgreSQL via PgKnowledgeRepository.
// store_snapshot JSONB is no longer a write target for knowledge operations.

/**
 * Factory function for the PostgreSQL-only knowledge repository.
 */
export function createKnowledgeRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): KnowledgeRepository {
  if (!config.pool) {
    throw new Error('knowledge writes require a PostgreSQL pool');
  }
  return new PgKnowledgeRepository(config.pool, config.store);
}

export async function loadKnowledgeEntriesByIds(
  repository: KnowledgeRepository,
  entryIds: string[],
): Promise<KnowledgeRecord[]> {
  if (entryIds.length === 0) {
    return [];
  }
  if (repository.getByIds) {
    return repository.getByIds(entryIds);
  }
  const loaded = await Promise.all(entryIds.map((entryId) => repository.getById(entryId)));
  return loaded.filter((entry): entry is KnowledgeRecord => entry !== null);
}

export async function saveKnowledgeEntry(
  repository: KnowledgeRepository,
  entry: KnowledgeRecord,
): Promise<void> {
  if (repository.save) {
    await repository.save(entry);
    return;
  }
  throw new Error('KnowledgeRepository.save() is required for this workflow');
}
