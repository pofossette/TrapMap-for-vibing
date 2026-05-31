/**
 * Repository interface and implementations for duplicate case persistence.
 *
 * This module provides:
 * - DuplicateRepository interface for duplicate case CRUD operations
 * - InMemoryDuplicateRepository implementation using SkillShareerStore
 * - Factory function for repository creation
 *
 * Phase: 100-01 (Store Repository Pattern)
 */

import type { Pool } from 'pg';

import type { DuplicateCaseRecord, SkillShareerStore } from '@trapmap/server/lib/store.js';
import { PgDuplicateRepository } from './pg-repository.js';

/**
 * Repository interface for duplicate case CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface DuplicateRepository {
  /**
   * Insert a new duplicate case.
   */
  insert(duplicateCase: DuplicateCaseRecord): Promise<void>;

  /**
   * Get a duplicate case by its ID.
   * Returns null if the case does not exist.
   */
  getById(caseId: string): Promise<DuplicateCaseRecord | null>;

  /**
   * List all duplicate cases for a specific candidate.
   */
  listByCandidate(candidateId: string): Promise<DuplicateCaseRecord[]>;

  /**
   * List all duplicate cases.
   */
  listAll(): Promise<DuplicateCaseRecord[]>;

  /**
   * Update a duplicate case by its ID.
   */
  update(caseId: string, updates: Partial<DuplicateCaseRecord>): Promise<void>;
}

/**
 * In-memory repository that uses SkillShareerStore for all duplicate case operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryDuplicateRepository implements DuplicateRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(duplicateCase: DuplicateCaseRecord): Promise<void> {
    await this.store.transact((data) => {
      data.duplicateCases.push(duplicateCase);
    });
  }

  async getById(caseId: string): Promise<DuplicateCaseRecord | null> {
    const data = await this.store.snapshot();
    return data.duplicateCases.find((d) => d.id === caseId) ?? null;
  }

  async listByCandidate(candidateId: string): Promise<DuplicateCaseRecord[]> {
    const data = await this.store.snapshot();
    return data.duplicateCases.filter((d) => d.candidateId === candidateId);
  }

  async listAll(): Promise<DuplicateCaseRecord[]> {
    const data = await this.store.snapshot();
    return data.duplicateCases;
  }

  async update(caseId: string, updates: Partial<DuplicateCaseRecord>): Promise<void> {
    await this.store.transact((data) => {
      const dc = data.duplicateCases.find((d) => d.id === caseId);
      if (dc) {
        Object.assign(dc, updates);
      }
    });
  }
}

/**
 * Factory function to create the appropriate DuplicateRepository.
 * Returns PgDuplicateRepository when pool is available (Round 5: PG-only),
 * InMemoryDuplicateRepository otherwise.
 */
export function createDuplicateRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): DuplicateRepository {
  if (config.pool) {
    return new PgDuplicateRepository(config.pool);
  }
  return new InMemoryDuplicateRepository(config.store);
}
