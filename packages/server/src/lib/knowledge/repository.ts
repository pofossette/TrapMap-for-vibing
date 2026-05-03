/**
 * Repository interface and implementations for knowledge entry persistence.
 *
 * This module provides:
 * - KnowledgeRepository interface abstracting CRUD operations
 * - DualWriteKnowledgeRepository for transition from JSONB to PostgreSQL
 * - InMemoryKnowledgeRepository for tests without PostgreSQL
 * - Factory function for repository selection
 *
 * Phase: 62 (WRITE-02)
 */

import type { Boundary, LifecycleState, Scope } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type {
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  SkillShareerStore,
} from '../store.js';
import {
  createKnowledgeEntryRecord,
  toKnowledgeEntry,
  toKnowledgeListItem,
} from '../knowledge.js';
import { transitionLifecycleState } from '../lifecycle/state-machine.js';

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
   */
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
  }): Promise<KnowledgeRecord[]>;

  /**
   * Update governance fields on an entry.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void>;
}

/**
 * Dual-write repository that writes to both primary and JSONB shadow.
 * Used during transition from JSONB snapshot to row-level PostgreSQL tables.
 *
 * Writes go to primary first (PostgreSQL), then shadow to JSONB via store.transact().
 * If shadow fails, relational data is authoritative.
 */
export class DualWriteKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly primary: KnowledgeRepository,
    private readonly store: SkillShareerStore,
  ) {}

  async nextId(): Promise<string> {
    return this.primary.nextId();
  }

  async insert(entry: KnowledgeRecord): Promise<void> {
    await this.primary.insert(entry);
    await this.store.transact((data) => {
      data.knowledgeEntries.push(entry);
    });
  }

  async getById(entryId: string): Promise<KnowledgeRecord | null> {
    return this.primary.getById(entryId);
  }

  async updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void> {
    await this.primary.updateLifecycle(entryId, newState, context);
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (entry) {
        transitionLifecycleState(entry, newState, 'dual-write update');
        entry.updatedAt = new Date().toISOString();
      }
    });
  }

  async appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void> {
    await this.primary.appendRevision(entryId, revision);
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (entry) {
        entry.history.push(revision);
        entry.latestRevision = revision;
        entry.updatedAt = new Date().toISOString();
      }
    });
  }

  async appendLifecycleEvent(
    entryId: string,
    event: KnowledgeLifecycleEventRecord,
  ): Promise<void> {
    await this.primary.appendLifecycleEvent(entryId, event);
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (entry) {
        entry.lifecycleHistory.push(event);
      }
    });
  }

  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
  }): Promise<KnowledgeRecord[]> {
    return this.primary.listByFilter(filter);
  }

  async updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void> {
    await this.primary.updateGovernance(entryId, governance);
    await this.store.transact((data) => {
      const entry = data.knowledgeEntries.find((e) => e.id === entryId);
      if (entry) {
        if (governance.labels !== undefined) {
          entry.labels = governance.labels;
        }
        if (governance.requiredLevel !== undefined) {
          entry.requiredLevel = governance.requiredLevel;
        }
        entry.updatedAt = new Date().toISOString();
      }
    });
  }
}

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
      data.knowledgeEntries.push(entry);
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

  async appendLifecycleEvent(
    entryId: string,
    event: KnowledgeLifecycleEventRecord,
  ): Promise<void> {
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
}

/**
 * Factory function to create the appropriate KnowledgeRepository.
 * Returns DualWriteKnowledgeRepository when pool is available,
 * InMemoryKnowledgeRepository otherwise.
 */
export function createKnowledgeRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): KnowledgeRepository {
  if (config.pool) {
    // Dynamic import to avoid loading pg module in test environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PgKnowledgeRepository } = require('./pg-repository.js') as {
      PgKnowledgeRepository: new (pool: Pool) => KnowledgeRepository;
    };
    const pgRepo = new PgKnowledgeRepository(config.pool);
    return new DualWriteKnowledgeRepository(pgRepo, config.store);
  }
  return new InMemoryKnowledgeRepository(config.store);
}

// Re-export types and functions for convenience
export { createKnowledgeEntryRecord, toKnowledgeEntry, toKnowledgeListItem };
