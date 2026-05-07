/**
 * Repository interface and implementations for audit event persistence.
 *
 * This module provides:
 * - AuditRepository interface for audit event CRUD operations
 * - InMemoryAuditRepository implementation using SkillShareerStore
 * - Factory function for repository creation
 *
 * Phase: 100-01 (Store Repository Pattern)
 */

import type { Pool } from 'pg';

import type { AuditEventRecord, SkillShareerStore } from '../store.js';

/**
 * Repository interface for audit event CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface AuditRepository {
  /**
   * Generate a new unique audit event ID.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new audit event.
   */
  insert(event: AuditEventRecord): Promise<void>;

  /**
   * Get an audit event by its ID.
   * Returns null if the event does not exist.
   */
  getById(eventId: string): Promise<AuditEventRecord | null>;

  /**
   * List audit events matching filter criteria.
   * Returns paginated results with total count.
   */
  listByFilter(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditEventRecord[]; total: number }>;
}

/**
 * In-memory repository that uses SkillShareerStore for all audit operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryAuditRepository implements AuditRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'audit');
  }

  async insert(event: AuditEventRecord): Promise<void> {
    await this.store.transact((data) => {
      data.auditEvents.push(event);
    });
  }

  async getById(eventId: string): Promise<AuditEventRecord | null> {
    const data = await this.store.snapshot();
    return data.auditEvents.find((e) => e.id === eventId) ?? null;
  }

  async listByFilter(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditEventRecord[]; total: number }> {
    const data = await this.store.snapshot();
    let events = data.auditEvents;

    if (filter.action && filter.action.length > 0) {
      const actionSet = new Set(filter.action);
      events = events.filter((e) => actionSet.has(e.action));
    }
    if (filter.actorId) {
      events = events.filter((e) => e.actorId === filter.actorId);
    }
    if (filter.entityId) {
      events = events.filter((e) => e.entityId === filter.entityId);
    }
    if (filter.teamId !== undefined) {
      events = events.filter((e) => e.teamId === filter.teamId);
    }
    if (filter.from) {
      events = events.filter((e) => e.createdAt >= filter.from!);
    }
    if (filter.to) {
      events = events.filter((e) => e.createdAt <= filter.to!);
    }

    events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = filter.limit ?? 25;
    const total = events.length;
    events = events.slice(0, limit);

    return { items: events, total };
  }
}

/**
 * Factory function to create the appropriate AuditRepository.
 * Returns InMemoryAuditRepository (Pg implementation to be added in future phase).
 */
export function createAuditRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): AuditRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgAuditRepository(config.pool);
  //   return new DualWriteAuditRepository(pgRepo, config.store);
  // }
  return new InMemoryAuditRepository(config.store);
}
