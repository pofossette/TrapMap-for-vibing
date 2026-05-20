/**
 * Repository interface and implementations for feedback queue persistence.
 *
 * This module provides:
 * - FeedbackRepository interface for feedback CRUD operations
 * - InMemoryFeedbackRepository implementation using SkillShareerStore
 * - PgFeedbackRepository implementation using PostgreSQL structured tables
 * - Factory function for repository creation
 *
 * Round 6: Added PgFeedbackRepository, replacing InMemory as default when pool available.
 */

import { createRequire } from 'node:module';
import type { Pool } from 'pg';

import type { FeedbackQueueRecord, SkillShareerStore } from '../store.js';

/**
 * Repository interface for feedback queue CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface FeedbackRepository {
  /**
   * Generate a new unique feedback ID.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new feedback record.
   */
  insert(feedback: FeedbackQueueRecord): Promise<void>;

  /**
   * Get a feedback record by its ID.
   * Returns null if the feedback does not exist.
   */
  getById(feedbackId: string): Promise<FeedbackQueueRecord | null>;

  /**
   * List all feedback for a specific entry.
   */
  listByEntry(entryId: string): Promise<FeedbackQueueRecord[]>;

  /**
   * List all feedback with a specific status.
   */
  listByStatus(status: string): Promise<FeedbackQueueRecord[]>;

  /**
   * List feedback matching multiple filter criteria.
   */
  listByFilter(filter: {
    status?: string[];
    problemType?: string[];
    entryId?: string;
    entryType?: string;
  }): Promise<FeedbackQueueRecord[]>;

  /**
   * Update a feedback record by its ID.
   */
  update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void>;
}

/**
 * In-memory repository that uses SkillShareerStore for all feedback operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryFeedbackRepository implements FeedbackRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'feedback');
  }

  async insert(feedback: FeedbackQueueRecord): Promise<void> {
    await this.store.transact((data) => {
      data.feedbackQueue.push(feedback);
    });
  }

  async getById(feedbackId: string): Promise<FeedbackQueueRecord | null> {
    const data = await this.store.snapshot();
    return data.feedbackQueue.find((f) => f.id === feedbackId) ?? null;
  }

  async listByEntry(entryId: string): Promise<FeedbackQueueRecord[]> {
    const data = await this.store.snapshot();
    return data.feedbackQueue.filter((f) => f.entryId === entryId);
  }

  async listByStatus(status: string): Promise<FeedbackQueueRecord[]> {
    const data = await this.store.snapshot();
    return data.feedbackQueue.filter((f) => f.status === status);
  }

  async listByFilter(filter: {
    status?: string[];
    problemType?: string[];
    entryId?: string;
    entryType?: string;
  }): Promise<FeedbackQueueRecord[]> {
    const data = await this.store.snapshot();
    let results = data.feedbackQueue;
    if (filter.status && filter.status.length > 0) {
      results = results.filter((f) => filter.status!.includes(f.status));
    }
    if (filter.problemType && filter.problemType.length > 0) {
      results = results.filter((f) => filter.problemType!.includes(f.problemType));
    }
    if (filter.entryId) {
      results = results.filter((f) => f.entryId === filter.entryId);
    }
    if (filter.entryType) {
      results = results.filter((f) => f.entryType === filter.entryType);
    }
    return results;
  }

  async update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void> {
    await this.store.transact((data) => {
      const feedback = data.feedbackQueue.find((f) => f.id === feedbackId);
      if (feedback) {
        Object.assign(feedback, updates);
        feedback.updatedAt = new Date().toISOString();
      }
    });
  }
}

/**
 * Factory function to create the appropriate FeedbackRepository.
 * Returns PgFeedbackRepository when pool is available (Round 6: PG-only),
 * InMemoryFeedbackRepository otherwise.
 */
export function createFeedbackRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): FeedbackRepository {
  if (config.pool) {
    // Dynamic import to avoid loading pg module in test environments
    const require = createRequire(import.meta.url);
    const { PgFeedbackRepository } = require('./pg-repository.js') as {
      PgFeedbackRepository: new (pool: Pool) => FeedbackRepository;
    };
    return new PgFeedbackRepository(config.pool);
  }
  return new InMemoryFeedbackRepository(config.store);
}
