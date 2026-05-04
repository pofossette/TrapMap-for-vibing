/**
 * Repository interface and implementations for team persistence.
 *
 * This module provides:
 * - TeamRepository interface for team CRUD operations
 * - InMemoryTeamRepository implementation using SkillShareerStore
 * - Factory function for repository creation
 *
 * Phase: 83-03 (Store Decoupling)
 */

import type { Pool } from 'pg';

import type { SkillShareerStore, TeamRecord } from '../store.js';

/**
 * Repository interface for team CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface TeamRepository {
  /**
   * Generate a new unique team ID.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new team.
   */
  insert(team: TeamRecord): Promise<void>;

  /**
   * Get a team by its ID.
   * Returns null if the team does not exist.
   */
  getById(teamId: string): Promise<TeamRecord | null>;

  /**
   * Get a team by its slug.
   * Returns null if the team does not exist.
   */
  getBySlug(slug: string): Promise<TeamRecord | null>;

  /**
   * List all teams.
   */
  listAll(): Promise<TeamRecord[]>;

  /**
   * Update a team by its ID.
   */
  update(teamId: string, updates: Partial<TeamRecord>): Promise<void>;
}

/**
 * In-memory repository that uses SkillShareerStore for all team operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryTeamRepository implements TeamRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'team');
  }

  async insert(team: TeamRecord): Promise<void> {
    await this.store.transact((data) => {
      data.teams.push(team);
    });
  }

  async getById(teamId: string): Promise<TeamRecord | null> {
    const data = await this.store.snapshot();
    return data.teams.find((t) => t.id === teamId) ?? null;
  }

  async getBySlug(slug: string): Promise<TeamRecord | null> {
    const data = await this.store.snapshot();
    return data.teams.find((t) => t.slug === slug) ?? null;
  }

  async listAll(): Promise<TeamRecord[]> {
    const data = await this.store.snapshot();
    return data.teams;
  }

  async update(teamId: string, updates: Partial<TeamRecord>): Promise<void> {
    await this.store.transact((data) => {
      const team = data.teams.find((t) => t.id === teamId);
      if (team) {
        Object.assign(team, updates);
        team.updatedAt = new Date().toISOString();
      }
    });
  }
}

/**
 * Factory function to create the appropriate TeamRepository.
 * Returns InMemoryTeamRepository (Pg implementation to be added in future phase).
 */
export function createTeamRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): TeamRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgTeamRepository(config.pool);
  //   return new DualWriteTeamRepository(pgRepo, config.store);
  // }
  return new InMemoryTeamRepository(config.store);
}
