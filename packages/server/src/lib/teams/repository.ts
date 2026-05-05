/**
 * Repository interface and implementations for team and membership persistence.
 *
 * This module provides:
 * - TeamRepository interface for team CRUD operations
 * - MembershipRepository interface for membership CRUD operations
 * - InMemory implementations using SkillShareerStore
 * - Factory functions for repository creation
 *
 * Phase: 83-03 (Store Decoupling)
 */

import type { Pool } from 'pg';

import type { MembershipRecord, SkillShareerStore, TeamRecord } from '../store.js';

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

/**
 * Repository interface for membership CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface MembershipRepository {
  /**
   * Generate a new unique membership ID.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new membership.
   */
  insert(membership: MembershipRecord): Promise<void>;

  /**
   * Get a membership by its ID.
   * Returns null if the membership does not exist.
   */
  getById(membershipId: string): Promise<MembershipRecord | null>;

  /**
   * Find a membership by user and team.
   * Returns null if the membership does not exist.
   */
  findByUserAndTeam(userId: string, teamId: string): Promise<MembershipRecord | null>;

  /**
   * List all memberships for a user.
   */
  listByUser(userId: string): Promise<MembershipRecord[]>;

  /**
   * List all memberships for a team.
   */
  listByTeam(teamId: string): Promise<MembershipRecord[]>;

  /**
   * Update a membership by its ID.
   */
  update(membershipId: string, updates: Partial<MembershipRecord>): Promise<void>;
}

/**
 * In-memory repository that uses SkillShareerStore for all membership operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryMembershipRepository implements MembershipRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'member');
  }

  async insert(membership: MembershipRecord): Promise<void> {
    await this.store.transact((data) => {
      data.memberships.push(membership);
    });
  }

  async getById(membershipId: string): Promise<MembershipRecord | null> {
    const data = await this.store.snapshot();
    return data.memberships.find((m) => m.id === membershipId) ?? null;
  }

  async findByUserAndTeam(userId: string, teamId: string): Promise<MembershipRecord | null> {
    const data = await this.store.snapshot();
    return data.memberships.find((m) => m.userId === userId && m.teamId === teamId) ?? null;
  }

  async listByUser(userId: string): Promise<MembershipRecord[]> {
    const data = await this.store.snapshot();
    return data.memberships.filter((m) => m.userId === userId);
  }

  async listByTeam(teamId: string): Promise<MembershipRecord[]> {
    const data = await this.store.snapshot();
    return data.memberships.filter((m) => m.teamId === teamId);
  }

  async update(membershipId: string, updates: Partial<MembershipRecord>): Promise<void> {
    await this.store.transact((data) => {
      const membership = data.memberships.find((m) => m.id === membershipId);
      if (membership) {
        Object.assign(membership, updates);
        membership.updatedAt = new Date().toISOString();
      }
    });
  }
}

/**
 * Factory function to create the appropriate MembershipRepository.
 * Returns InMemoryMembershipRepository (Pg implementation to be added in future phase).
 */
export function createMembershipRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): MembershipRepository {
  // TODO: When Pg implementation is added, use DualWrite pattern like KnowledgeRepository
  // if (config.pool) {
  //   const pgRepo = new PgMembershipRepository(config.pool);
  //   return new DualWriteMembershipRepository(pgRepo, config.store);
  // }
  return new InMemoryMembershipRepository(config.store);
}
