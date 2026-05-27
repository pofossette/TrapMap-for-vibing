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

import { createRequire } from 'node:module';
import type { LifecycleState } from '@trapmap/contracts';
import type { Pool } from 'pg';

import {
  createKnowledgeEntryRecord,
  toKnowledgeEntry,
  toKnowledgeListItem,
} from '@trapmap/server/lib/knowledge.js';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/state-machine.js';
import type {
  EmbeddingCacheRecord,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  SkillShareerStore,
} from '@trapmap/server/lib/store.js';

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
   * Update the lifecycle state of an entry.
   * Uses SELECT FOR UPDATE for row-level locking.
   * Validates transition using state machine.
   * Throws error if entry not found or invalid transition.
   */
  updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void>;

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
}

// Round 2: DualWriteKnowledgeRepository removed.
// Writes go exclusively to PostgreSQL via PgKnowledgeRepository.
// store_snapshot JSONB is no longer a write target for knowledge operations.

/**
 * In-memory repository that uses JsonStore for all operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'knowledge');
  }

  async insert(entry: KnowledgeRecord): Promise<void> {
    await this.store.transact((data) => {
      if (!data.knowledgeEntries.some((e) => e.id === entry.id)) {
        data.knowledgeEntries.push(entry);
      }
    });
  }

  async getById(entryId: string): Promise<KnowledgeRecord | null> {
    const data = await this.store.snapshot();
    return data.knowledgeEntries.find((e) => e.id === entryId) ?? null;
  }

  async updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void> {
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }
      transitionLifecycleState(entry, newState, context.note ?? 'update');
      entry.updatedAt = new Date().toISOString();
    });
  }

  async appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void> {
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }
      entry.history.push(revision);
      entry.latestRevision = revision;
      entry.updatedAt = new Date().toISOString();
    });
  }

  async appendLifecycleEvent(entryId: string, event: KnowledgeLifecycleEventRecord): Promise<void> {
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }
      entry.lifecycleHistory.push(event);
    });
  }

  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    labels?: string[];
  }): Promise<KnowledgeRecord[]> {
    const data = await this.store.snapshot();
    return data.knowledgeEntries.filter((entry) => {
      if (filter.lifecycleState !== undefined && entry.lifecycleState !== filter.lifecycleState) {
        return false;
      }
      if (filter.teamId !== undefined && entry.teamId !== filter.teamId) {
        return false;
      }
      if (filter.ownerUserId !== undefined && entry.ownerUserId !== filter.ownerUserId) {
        return false;
      }
      // Round 3: ALL labels must match (AND semantics)
      if (filter.labels !== undefined && filter.labels.length > 0) {
        const hasAllLabels = filter.labels.every((label) => entry.labels.includes(label));
        if (!hasAllLabels) return false;
      }
      return true;
    });
  }

  async updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void> {
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }
      if (governance.labels !== undefined) {
        entry.labels = governance.labels;
      }
      if (governance.requiredLevel !== undefined) {
        entry.requiredLevel = governance.requiredLevel;
      }
      entry.updatedAt = new Date().toISOString();
    });
  }

  async updateEmbeddingCache(entryId: string, cache: EmbeddingCacheRecord): Promise<void> {
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }
      entry.embeddingCache = cache;
      entry.updatedAt = new Date().toISOString();
    });
  }
}

/**
 * Factory function to create the appropriate KnowledgeRepository.
 * Returns PgKnowledgeRepository when pool is available (Round 2: PG-only, no DualWrite),
 * InMemoryKnowledgeRepository otherwise.
 */
export function createKnowledgeRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): KnowledgeRepository {
  if (config.pool) {
    // Dynamic import to avoid loading pg module in test environments
    const require = createRequire(import.meta.url);
    const { PgKnowledgeRepository } = require('./pg-repository.js') as {
      PgKnowledgeRepository: new (pool: Pool) => KnowledgeRepository;
    };
    // Round 2: PG-only, no JSONB shadow writes
    return new PgKnowledgeRepository(config.pool);
  }
  return new InMemoryKnowledgeRepository(config.store);
}

// Re-export types and functions for convenience
export { createKnowledgeEntryRecord, toKnowledgeEntry, toKnowledgeListItem };
