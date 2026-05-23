/**
 * Repository interface and implementations for user persistence.
 *
 * This module provides:
 * - UserRepository interface for user CRUD operations
 * - InMemoryUserRepository implementation using SkillShareerStore
 * - Factory function for repository creation
 *
 * Phase: 83-03 (Store Decoupling)
 */

import type { Pool } from 'pg';

import type { SkillShareerStore, UserRecord } from '@trapmap/server/lib/store.js';

/**
 * Repository interface for user CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface UserRepository {
  /**
   * Generate a new unique user ID.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new user.
   */
  insert(user: UserRecord): Promise<void>;

  /**
   * Get a user by their ID.
   * Returns null if the user does not exist.
   */
  getById(userId: string): Promise<UserRecord | null>;

  /**
   * Get a user by their handle.
   * Returns null if the user does not exist.
   */
  getByHandle(handle: string): Promise<UserRecord | null>;

  /**
   * Update a user by their ID.
   */
  update(userId: string, updates: Partial<UserRecord>): Promise<void>;
}

/**
 * In-memory repository that uses SkillShareerStore for all user operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'user');
  }

  async insert(user: UserRecord): Promise<void> {
    await this.store.transact((data) => {
      data.users.push(user);
    });
  }

  async getById(userId: string): Promise<UserRecord | null> {
    const data = await this.store.snapshot();
    return data.users.find((u) => u.id === userId) ?? null;
  }

  async getByHandle(handle: string): Promise<UserRecord | null> {
    const data = await this.store.snapshot();
    return data.users.find((u) => u.handle === handle) ?? null;
  }

  async update(userId: string, updates: Partial<UserRecord>): Promise<void> {
    await this.store.transact((data) => {
      const user = data.users.find((u) => u.id === userId);
      if (user) {
        Object.assign(user, updates);
        user.updatedAt = new Date().toISOString();
      }
    });
  }
}

/**
 * Factory function to create the appropriate UserRepository.
 * Returns InMemoryUserRepository (Pg implementation to be added in future phase).
 */
export function createUserRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): UserRepository {
  // TODO[post-Round-8]: Add PgUserRepository when users domain migrates to structured tables.
  return new InMemoryUserRepository(config.store);
}
