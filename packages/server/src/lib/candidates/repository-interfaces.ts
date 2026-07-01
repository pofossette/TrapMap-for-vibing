/**
 * Candidate repository interfaces.
 *
 * Extracted from repository.ts to break the circular dependency between
 * repository.ts and pg-repository/pg-candidate-repository.ts.
 *
 * Both files import from this module instead of from each other.
 */
import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  ManualResultSubmission,
} from '@trapmap/contracts';
import type { PoolClient } from 'pg';

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

  /**
   * Find a candidate ID by exact fingerprint match.
   * Used for fast ingest-time duplicate detection.
   * Returns the candidate ID of an existing candidate with the same fingerprint, or null.
   */
  findByFingerprint(fingerprint: string): Promise<string | null>;
}

export interface TransactionalCandidateRepository extends CandidateRepository {
  insertTx(client: PoolClient, candidate: CandidateSubmission): Promise<void>;
  updateStatusTx(
    client: PoolClient,
    candidateId: string,
    status: CandidateStatus,
    error?: string,
  ): Promise<void>;
  attachDuplicateCaseTx(
    client: PoolClient,
    candidateId: string,
    duplicateCase: DuplicateCase,
  ): Promise<void>;
  findByFingerprintTx(client: PoolClient, fingerprint: string): Promise<string | null>;
}
