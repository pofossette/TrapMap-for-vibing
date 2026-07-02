import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  ManualResultSubmission,
} from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { DuplicateRepository } from '@trapmap/server/lib/duplicates/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { PgCandidateRepository } from './pg-repository/pg-candidate-repository.js';
import type { CandidateRepository } from './repository-interfaces.js';
import type { ManualResultRecord } from './store.js';
import {
  attachAnalysisSnapshot,
  attachDuplicateCase as attachDuplicateCaseToStore,
  attachManualResult,
  markCandidateResolved,
  updateCandidateStatus,
} from './store.js';

// Re-export interfaces from the shared module for backward compatibility.
// All new code should import from repository-interfaces.ts directly.
export type {
  CandidateRepository,
  TransactionalCandidateRepository,
} from './repository-interfaces.js';

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
 * Dual-write has been removed in Round 2.
 * Writes go exclusively to PostgreSQL via PgCandidateRepository.
 * store_snapshot JSONB is no longer a write target for candidate operations.
 */

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
      await this.duplicateRepo.insert(
        duplicateCase as import('@trapmap/server/lib/store.js').DuplicateCaseRecord,
      );
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

  async findByFingerprint(fingerprint: string): Promise<string | null> {
    const data = await this.store.snapshot();
    const match = data.candidateSubmissions.find(
      (c) => c.analysisSnapshot?.fingerprint === fingerprint,
    );
    return match?.id ?? null;
  }
}

/**
 * Factory function to create the appropriate CandidateRepository.
 * Returns PgCandidateRepository when pool is available (Round 2: PG-only, no DualWrite),
 * InMemoryCandidateRepository otherwise.
 */
export function createCandidateRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
  duplicateRepo?: DuplicateRepository;
}): CandidateRepository {
  if (config.pool) {
    // Round 2: PG-only, no JSONB shadow writes
    return new PgCandidateRepository(config.pool);
  }
  return new InMemoryCandidateRepository(config.store, config.duplicateRepo);
}
