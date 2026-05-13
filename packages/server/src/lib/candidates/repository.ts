import { createRequire } from 'node:module';
import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  ManualResultSubmission,
} from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { DuplicateRepository } from '../duplicates/index.js';
import type { SkillShareerStore } from '../store.js';
import type { ManualResultRecord } from './store.js';
import {
  attachAnalysisSnapshot,
  attachDuplicateCase as attachDuplicateCaseToStore,
  attachManualResult,
  markCandidateResolved,
  updateCandidateStatus,
} from './store.js';

/**
 * Repository interface for candidate CRUD operations.
 * Abstracts away whether data lives in JSONB or a dedicated table.
 *
 * This interface enables the dual-write pattern during the transition
 * from JSONB snapshot storage to row-level PostgreSQL tables.
 */
export interface CandidateRepository {
  /**
   * Insert a new candidate submission.
   * The candidate ID should be pre-generated and included in the submission.
   */
  insert(candidate: CandidateSubmission): Promise<void>;

  /**
   * Get a candidate by its ID.
   * Returns null if the candidate does not exist.
   */
  getById(candidateId: string): Promise<CandidateSubmission | null>;

  /**
   * Update the status of a candidate.
   * Sets appropriate timestamps based on the new status.
   * Throws an error if the candidate does not exist.
   */
  updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void>;

  /**
   * Attach an analysis snapshot to a candidate.
   * Called after duplicate detection analysis completes.
   */
  attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void>;

  /**
   * Attach a duplicate case to a candidate.
   * Called when duplicate detection finds potential matches.
   */
  attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void>;

  /**
   * Attach a manual result from reviewer.
   * Constructs ManualResultRecord with submittedAt/submittedBy.
   */
  attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void>;

  /**
   * List all candidates with a specific status.
   * Used by processor to find pending candidates.
   */
  listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]>;

  /**
   * Mark a candidate as resolved after applying manual result.
   * Sets status to 'resolved' and records completion timestamp.
   */
  markResolved(candidateId: string, resolvedBy: string): Promise<void>;
}

/**
 * Type guard to check if an object is a valid CandidateSubmission.
 * Useful for validation in repository implementations.
 */
export function isCandidateSubmission(value: unknown): value is CandidateSubmission {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.sourceType === 'string' &&
    typeof obj.submittedBy === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.receivedAt === 'string'
  );
}

/**
 * Helper to construct a ManualResultRecord from a submission.
 */
export function createManualResultRecord(
  result: ManualResultSubmission,
  reviewedBy: string,
): ManualResultRecord {
  return {
    ...result,
    submittedAt: new Date().toISOString(),
    submittedBy: reviewedBy,
  };
}

/**
 * Dual-write repository that writes to both primary and JSONB shadow.
 * Used during transition from JSONB snapshot to row-level PostgreSQL tables.
 *
 * Writes go to primary first (PostgreSQL), then shadow to JSONB via store.transact().
 * If shadow fails, relational data is authoritative.
 */
export class DualWriteCandidateRepository implements CandidateRepository {
  constructor(
    private readonly primary: CandidateRepository,
    private readonly store: SkillShareerStore,
    private readonly duplicateRepo: DuplicateRepository,
  ) {}

  async insert(candidate: CandidateSubmission): Promise<void> {
    await this.primary.insert(candidate);
    await this.store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
  }

  async getById(candidateId: string): Promise<CandidateSubmission | null> {
    return this.primary.getById(candidateId);
  }

  async updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void> {
    await this.primary.updateStatus(candidateId, status, error);
    await this.store.transact((data) => {
      if (error !== undefined) {
        updateCandidateStatus({ data, candidateId, status, error });
      } else {
        updateCandidateStatus({ data, candidateId, status });
      }
    });
  }

  async attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void> {
    await this.primary.attachAnalysis(candidateId, snapshot);
    await this.store.transact((data) => {
      attachAnalysisSnapshot({ data, candidateId, snapshot });
    });
  }

  async attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void> {
    await this.primary.attachDuplicateCase(candidateId, duplicateCase);
    await this.duplicateRepo.insert(duplicateCase as import('../store.js').DuplicateCaseRecord);
    await this.store.transact((data) => {
      attachDuplicateCaseToStore({ data, candidateId, duplicateCase });
    });
  }

  async attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void> {
    await this.primary.attachManualResult(candidateId, result, reviewedBy);
    await this.store.transact((data) => {
      attachManualResult({ data, candidateId, result, reviewedBy });
    });
  }

  async listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]> {
    return this.primary.listByStatus(status);
  }

  async markResolved(candidateId: string, resolvedBy: string): Promise<void> {
    await this.primary.markResolved(candidateId, resolvedBy);
    await this.store.transact((data) => {
      markCandidateResolved({ data, candidateId, resolvedBy });
    });
  }
}

/**
 * In-memory repository that uses JsonStore for all operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryCandidateRepository implements CandidateRepository {
  constructor(
    private readonly store: SkillShareerStore,
    private readonly duplicateRepo?: DuplicateRepository,
  ) {}

  async insert(candidate: CandidateSubmission): Promise<void> {
    await this.store.transact((data) => {
      data.candidateSubmissions.push(candidate);
    });
  }

  async getById(candidateId: string): Promise<CandidateSubmission | null> {
    const data = await this.store.snapshot();
    return data.candidateSubmissions.find((c) => c.id === candidateId) ?? null;
  }

  async updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void> {
    await this.store.transact((data) => {
      if (error !== undefined) {
        updateCandidateStatus({ data, candidateId, status, error });
      } else {
        updateCandidateStatus({ data, candidateId, status });
      }
    });
  }

  async attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void> {
    await this.store.transact((data) => {
      attachAnalysisSnapshot({ data, candidateId, snapshot });
    });
  }

  async attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void> {
    if (this.duplicateRepo) {
      await this.duplicateRepo.insert(duplicateCase as import('../store.js').DuplicateCaseRecord);
    }
    await this.store.transact((data) => {
      attachDuplicateCaseToStore({ data, candidateId, duplicateCase });
    });
  }

  async attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void> {
    await this.store.transact((data) => {
      attachManualResult({ data, candidateId, result, reviewedBy });
    });
  }

  async listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]> {
    const data = await this.store.snapshot();
    return data.candidateSubmissions.filter((c) => c.status === status);
  }

  async markResolved(candidateId: string, resolvedBy: string): Promise<void> {
    await this.store.transact((data) => {
      markCandidateResolved({ data, candidateId, resolvedBy });
    });
  }
}

/**
 * Factory function to create the appropriate CandidateRepository.
 * Returns DualWriteCandidateRepository when pool is available,
 * InMemoryCandidateRepository otherwise.
 */
export function createCandidateRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
  duplicateRepo?: DuplicateRepository;
}): CandidateRepository {
  if (config.pool) {
    // Dynamic import to avoid loading pg module in test environments
    const require = createRequire(import.meta.url);
    const { PgCandidateRepository } = require('./pg-repository.js') as {
      PgCandidateRepository: new (pool: Pool) => CandidateRepository;
    };
    const pgRepo = new PgCandidateRepository(config.pool);
    return new DualWriteCandidateRepository(pgRepo, config.store, config.duplicateRepo!);
  }
  return new InMemoryCandidateRepository(config.store, config.duplicateRepo);
}
