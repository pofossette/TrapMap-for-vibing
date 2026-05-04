/**
 * Repository interfaces and implementations for auth-related persistence.
 *
 * This module provides:
 * - SessionRepository interface for session CRUD operations
 * - AccessKeyRepository interface for access key CRUD operations
 * - InMemory implementations for tests without PostgreSQL
 * - Factory functions for repository selection
 *
 * Phase: 83-01 (Store Decoupling)
 */

import type { Pool } from 'pg';

import type { AccessKeyRecord, SessionRecord, SkillShareerStore } from '../store.js';

/**
 * Repository interface for session CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface SessionRepository {
  /**
   * Generate a new unique session ID.
   */
  nextId(): Promise<string>;

  /**
   * Create a new session.
   * Returns the created session record with generated id and timestamps.
   */
  create(
    session: Omit<SessionRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SessionRecord>;

  /**
   * Get a session by its token hash.
   * Returns null if the session does not exist.
   */
  getByTokenHash(tokenHash: string): Promise<SessionRecord | null>;

  /**
   * Delete a session by its token hash.
   */
  deleteByTokenHash(tokenHash: string): Promise<void>;

  /**
   * Update the active team for a session.
   * Returns the updated session record.
   */
  updateActiveTeam(sessionId: string, teamId: string | null): Promise<SessionRecord>;
}

/**
 * Repository interface for access key CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface AccessKeyRepository {
  /**
   * Insert a new access key.
   */
  insert(key: AccessKeyRecord): Promise<void>;

  /**
   * Get an access key by its token hash.
   * Returns null if the key does not exist.
   */
  getByTokenHash(tokenHash: string): Promise<AccessKeyRecord | null>;

  /**
   * Get an access key by its ID.
   * Returns null if the key does not exist.
   */
  getById(keyId: string): Promise<AccessKeyRecord | null>;

  /**
   * Revoke an access key by its ID.
   */
  revoke(keyId: string): Promise<void>;

  /**
   * List all access keys for a member.
   */
  listByMember(memberId: string): Promise<AccessKeyRecord[]>;
}

/**
 * In-memory repository that uses SkillShareerStore for all session operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemorySessionRepository implements SessionRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'session');
  }

  async create(
    session: Omit<SessionRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SessionRecord> {
    const now = new Date().toISOString();

    return this.store.transact((data) => {
      const id = this.store.nextId(data, 'session');
      const record: SessionRecord = {
        ...session,
        id,
        createdAt: now,
        updatedAt: now,
      };
      data.sessions.push(record);
      return record;
    });
  }

  async getByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const data = await this.store.snapshot();
    return data.sessions.find((s) => s.tokenHash === tokenHash) ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.store.transact((data) => {
      data.sessions = data.sessions.filter((s) => s.tokenHash !== tokenHash);
    });
  }

  async updateActiveTeam(sessionId: string, teamId: string | null): Promise<SessionRecord> {
    return this.store.transact((data) => {
      const session = data.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      session.activeTeamId = teamId;
      session.updatedAt = new Date().toISOString();
      return session;
    });
  }
}

/**
 * In-memory repository that uses SkillShareerStore for all access key operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryAccessKeyRepository implements AccessKeyRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(key: AccessKeyRecord): Promise<void> {
    await this.store.transact((data) => {
      data.accessKeys.push(key);
    });
  }

  async getByTokenHash(tokenHash: string): Promise<AccessKeyRecord | null> {
    const data = await this.store.snapshot();
    return data.accessKeys.find((k) => k.tokenHash === tokenHash) ?? null;
  }

  async getById(keyId: string): Promise<AccessKeyRecord | null> {
    const data = await this.store.snapshot();
    return data.accessKeys.find((k) => k.id === keyId) ?? null;
  }

  async revoke(keyId: string): Promise<void> {
    await this.store.transact((data) => {
      const key = data.accessKeys.find((k) => k.id === keyId);
      if (key) {
        key.revokedAt = new Date().toISOString();
        key.updatedAt = new Date().toISOString();
      }
    });
  }

  async listByMember(memberId: string): Promise<AccessKeyRecord[]> {
    const data = await this.store.snapshot();
    return data.accessKeys.filter((k) => k.memberId === memberId);
  }
}

/**
 * Factory function to create the appropriate SessionRepository.
 * Returns InMemorySessionRepository (Pg implementation to be added in future phase).
 */
export function createSessionRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): SessionRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgSessionRepository(config.pool);
  //   return new DualWriteSessionRepository(pgRepo, config.store);
  // }
  return new InMemorySessionRepository(config.store);
}

/**
 * Factory function to create the appropriate AccessKeyRepository.
 * Returns InMemoryAccessKeyRepository (Pg implementation to be added in future phase).
 */
export function createAccessKeyRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): AccessKeyRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgAccessKeyRepository(config.pool);
  //   return new DualWriteAccessKeyRepository(pgRepo, config.store);
  // }
  return new InMemoryAccessKeyRepository(config.store);
}
