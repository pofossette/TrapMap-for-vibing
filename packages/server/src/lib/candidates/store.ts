import type { JsonStore, StoreData } from '../store.js';
import type { CandidateSubmission, DuplicateCase, CandidateStatus, ManualResultSubmission } from '@trapmap/contracts';
import { nowIso } from '../store.js';

/**
 * Manual result record stored on candidate.
 * Captures reviewer decision and allows correction before Phase 35 processing.
 */
export interface ManualResultRecord extends ManualResultSubmission {
  submittedAt: string;
  submittedBy: string;
}

const MAX_RETRIES = 3;

/**
 * Create a new candidate submission from an uploaded payload.
 */
export function createCandidateSubmission(args: {
  store: JsonStore;
  data: StoreData;
  sourceType: 'trap' | 'skill';
  submittedBy: string;
  teamId: string | null;
  originalPayload: CandidateSubmission['originalPayload'];
}): CandidateSubmission {
  const id = args.store.nextId(args.data, 'candidate');

  const candidate: CandidateSubmission = {
    id,
    sourceType: args.sourceType,
    submittedBy: args.submittedBy,
    teamId: args.teamId,
    status: 'received',
    originalPayload: args.originalPayload,
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: nowIso(),
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
  };

  args.data.candidateSubmissions.push(candidate);
  return candidate;
}

/**
 * Update candidate status with proper state transition.
 */
export function updateCandidateStatus(args: {
  data: StoreData;
  candidateId: string;
  status: CandidateStatus;
  error?: string;
}): CandidateSubmission {
  const candidate = args.data.candidateSubmissions.find(c => c.id === args.candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${args.candidateId} not found`);
  }

  const now = nowIso();

  candidate.status = args.status;

  // Set timestamps based on status
  if (args.status === 'queued') {
    candidate.queuedAt = now;
  } else if (args.status === 'analyzing') {
    candidate.analyzingAt = now;
  } else if (args.status === 'ready_for_review' || args.status === 'duplicate_detected') {
    candidate.completedAt = now;
  } else if (args.status === 'error') {
    candidate.completedAt = now;
    candidate.lastError = args.error ?? 'Unknown error';
    candidate.retryCount += 1;
  }

  return candidate;
}

/**
 * Attach analysis snapshot to candidate.
 */
export function attachAnalysisSnapshot(args: {
  data: StoreData;
  candidateId: string;
  snapshot: CandidateSubmission['analysisSnapshot'];
}): CandidateSubmission {
  const candidate = args.data.candidateSubmissions.find(c => c.id === args.candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${args.candidateId} not found`);
  }

  candidate.analysisSnapshot = args.snapshot;
  return candidate;
}

/**
 * Attach duplicate case to candidate.
 */
export function attachDuplicateCase(args: {
  data: StoreData;
  candidateId: string;
  duplicateCase: DuplicateCase;
}): CandidateSubmission {
  const candidate = args.data.candidateSubmissions.find(c => c.id === args.candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${args.candidateId} not found`);
  }

  candidate.duplicateCase = args.duplicateCase;

  // Also store in duplicateCases collection for querying
  args.data.duplicateCases.push(args.duplicateCase);

  return candidate;
}

/**
 * Get candidate by ID.
 */
export function getCandidateById(data: StoreData, candidateId: string): CandidateSubmission | null {
  return data.candidateSubmissions.find(c => c.id === candidateId) ?? null;
}

/**
 * Get all candidates in a specific status.
 */
export function getCandidatesByStatus(data: StoreData, status: CandidateStatus): CandidateSubmission[] {
  return data.candidateSubmissions.filter(c => c.status === status);
}

/**
 * Get candidates that need processing (received or queued).
 */
export function getPendingCandidates(data: StoreData): CandidateSubmission[] {
  return data.candidateSubmissions.filter(c =>
    c.status === 'received' || c.status === 'queued'
  );
}

/**
 * Get candidates in error state that can be retried.
 */
export function getRetryableCandidates(data: StoreData): CandidateSubmission[] {
  return data.candidateSubmissions.filter(c =>
    c.status === 'error' && c.retryCount < MAX_RETRIES
  );
}

/**
 * Get duplicate case by candidate ID.
 */
export function getDuplicateCaseByCandidateId(data: StoreData, candidateId: string): DuplicateCase | null {
  return data.duplicateCases.find(dc => dc.candidateId === candidateId) ?? null;
}

/**
 * Get all duplicate cases.
 */
export function getAllDuplicateCases(data: StoreData): DuplicateCase[] {
  return data.duplicateCases;
}

/**
 * Check if candidate can be retried.
 */
export function canRetryCandidate(candidate: CandidateSubmission): boolean {
  return candidate.status === 'error' && candidate.retryCount < MAX_RETRIES;
}

/**
 * Get max retries constant.
 */
export function getMaxRetries(): number {
  return MAX_RETRIES;
}

/**
 * Find candidates that were interrupted during processing.
 * Returns candidates in 'queued' or 'analyzing' state that need recovery.
 */
export function findInterruptedCandidates(data: StoreData): CandidateSubmission[] {
  return data.candidateSubmissions.filter(c =>
    c.status === 'queued' || c.status === 'analyzing'
  );
}

/**
 * Reset interrupted candidates back to 'received' for reprocessing.
 */
export function resetInterruptedCandidates(args: {
  data: StoreData;
  reason: string;
}): CandidateSubmission[] {
  const interrupted = findInterruptedCandidates(args.data);
  const now = nowIso();

  for (const candidate of interrupted) {
    candidate.status = 'received';
    candidate.queuedAt = null;
    candidate.analyzingAt = null;
    candidate.lastError = `Reset on startup: ${args.reason}`;
    candidate.retryCount += 1;
  }

  return interrupted;
}

/**
 * Attach manual result to candidate.
 * Only candidates in 'duplicate_detected' status can receive manual results.
 */
export function attachManualResult(args: {
  data: StoreData;
  candidateId: string;
  result: ManualResultSubmission;
  reviewedBy: string;
}): { candidate: CandidateSubmission; previousResult: ManualResultRecord | null } {
  const candidate = args.data.candidateSubmissions.find(c => c.id === args.candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${args.candidateId} not found`);
  }

  if (candidate.status !== 'duplicate_detected') {
    throw new Error(`Candidate ${args.candidateId} is not in duplicate_detected status (current: ${candidate.status})`);
  }

  const previousResult = candidate.manualResult;

  const manualResult: ManualResultRecord = {
    ...args.result,
    submittedAt: nowIso(),
    submittedBy: args.reviewedBy,
  };

  // Store on candidate (allow correction)
  candidate.manualResult = manualResult;

  return { candidate, previousResult };
}

/**
 * Get manual result from candidate.
 */
export function getManualResult(data: StoreData, candidateId: string): ManualResultRecord | null {
  const candidate = data.candidateSubmissions.find(c => c.id === candidateId);
  if (!candidate) {
    return null;
  }
  return candidate.manualResult;
}
