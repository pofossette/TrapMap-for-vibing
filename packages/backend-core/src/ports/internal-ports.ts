/**
 * Internal service invocation ports.
 *
 * These ports define the contract for inter-module communication within
 * backend-core. Each bounded-context module exposes its capabilities
 * as a port that other modules (or host assemblies) can invoke.
 *
 * This layer enables both in-process direct invocation (light host)
 * and remote RPC invocation (distributed host) through the same interface.
 */

import type {
  BadcaseExportDraftPayload,
  CandidateStatus,
  CandidateSubmission,
  ConflictRelation,
  FeedbackBatchRequest,
  FeedbackBatchResponse,
  FeedbackListRequest,
  FeedbackListResponse,
  FeedbackRemediationCompleteRequest,
  FeedbackRemediationCompleteResponse,
  FeedbackRemediationDetailResponse,
  FeedbackRemediationQueueResponse,
  FeedbackRemediationState,
  FeedbackStatsResponse,
  GovernanceConflictDetectionPayload,
  RemediationReactivationPayload,
} from '@trapmap/contracts';

import type { FeedbackQueueRecord, KnowledgeEntryRecord } from './repo-ports.js';
import type { ReadModelProjectionStatus, RetrievalSearchResponse } from './retrieval-ports.js';

// ---------------------------------------------------------------------------
// Identity & Access port
// ---------------------------------------------------------------------------

export interface LoginResult {
  sessionToken: string;
  userId: string;
  handle: string;
}

export interface IdentityAccessPort {
  login(handle: string, password: string): Promise<LoginResult>;
  loginSystemAdmin(systemAdminKey: string): Promise<{ sessionToken: string }>;
  logout(sessionToken: string): Promise<void>;
  validateSession(sessionToken: string): Promise<{
    sessionId: string;
    userId: string;
    handle: string;
    activeTeamId: string | null;
    securityLevel: number;
  } | null>;
  selectTeam(sessionToken: string, teamId: string): Promise<void>;
  createTeam(name: string, slug: string, actorId: string): Promise<{ teamId: string }>;
  listTeams(userId: string): Promise<Array<{ id: string; slug: string; name: string }>>;
  addMember(teamId: string, userId: string, role: string, actorId: string): Promise<void>;
  updateMember(memberId: string, updates: Record<string, unknown>, actorId: string): Promise<void>;
  provisionAccessKey(memberId: string, actorId: string): Promise<{ keyId: string; token: string }>;
}

// ---------------------------------------------------------------------------
// Knowledge Read port
// ---------------------------------------------------------------------------

export interface KnowledgeReadPort {
  getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
  listMine(userId: string, teamId?: string): Promise<KnowledgeEntryRecord[]>;
  search(params: {
    query: string;
    teamId?: string;
    limit?: number;
  }): Promise<RetrievalSearchResponse>;
  getProjectionStatus(): Promise<ReadModelProjectionStatus>;
  /** Rebuild the owner projection; available only on operator-facing hosts. */
  rebuildProjection?(): Promise<ReadModelProjectionStatus>;
}

// ---------------------------------------------------------------------------
// Knowledge Write port
// ---------------------------------------------------------------------------

export interface KnowledgeEntryUpdate {
  title?: string;
  content?: string;
  labels?: string[];
  [key: string]: unknown;
}

export interface KnowledgeWritePort {
  submit(input: {
    content: string;
    title?: string;
    labels?: string[];
    teamId?: string;
    actorId: string;
    [key: string]: unknown;
  }): Promise<{ entryId: string }>;

  updateEntry(entryId: string, updates: KnowledgeEntryUpdate, actorId: string): Promise<void>;

  resubmit(entryId: string, input: KnowledgeEntryUpdate, actorId: string): Promise<void>;

  supersede(entryId: string, replacementId: string, actorId: string): Promise<void>;

  createTrap(input: {
    content: string;
    title?: string;
    teamId: string;
    actorId: string;
    [key: string]: unknown;
  }): Promise<{ trapId: string }>;

  approveReviewDecision(input: {
    entryId: string;
    actorId: string;
    note?: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; lifecycleState: 'approved' }>;

  rejectReviewDecision(input: {
    entryId: string;
    actorId: string;
    note?: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; lifecycleState: 'rejected' }>;

  applyMaintenanceDecision(input: {
    entryId: string;
    actorId: string;
    note?: string;
    action: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; action: string }>;

  applyDecayDecision(input: {
    entryId: string;
    actorId: string;
    note?: string;
    action: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; action: string }>;

  publishCandidateResult(input: {
    candidateId: string;
    actorId: string;
    result: Record<string, unknown>;
  }): Promise<{ entryId?: string; candidateId: string }>;

  listTraps(teamId: string): Promise<KnowledgeEntryRecord[]>;
  getTrap(trapId: string): Promise<KnowledgeEntryRecord | null>;
}

// ---------------------------------------------------------------------------
// Candidate Ingestion port
// ---------------------------------------------------------------------------

export interface CandidateIngestionPort {
  submit(candidate: CandidateSubmission): Promise<{ candidateId: string }>;
  getById(candidateId: string): Promise<CandidateSubmission | null>;
  listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]>;
  applyResolution(
    candidateId: string,
    resolution: Record<string, unknown>,
    actorId: string,
  ): Promise<void>;
  submitManualResult(
    candidateId: string,
    result: Record<string, unknown>,
    actorId: string,
  ): Promise<void>;
  publishCandidateResult(
    candidateId: string,
    result: Record<string, unknown>,
    actorId: string,
  ): Promise<{ entryId?: string; candidateId: string }>;
}

// ---------------------------------------------------------------------------
// Governance & Review port
// ---------------------------------------------------------------------------

export interface ReviewPort {
  approve(input: {
    entryId: string;
    actorId: string;
    note?: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; lifecycleState: 'approved' }>;
  reject(input: {
    entryId: string;
    actorId: string;
    note?: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; lifecycleState: 'rejected' }>;
  applyMaintenance(input: {
    entryId: string;
    actorId: string;
    note?: string;
    action: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; action: string }>;
  applyDecay(input: {
    entryId: string;
    actorId: string;
    note?: string;
    action: string;
    evidence?: Record<string, unknown>;
  }): Promise<{ entryId: string; action: string }>;
  reviewArtifact(
    artifactId: string,
    decision: 'approve' | 'reject',
    actorId: string,
    note?: string,
  ): Promise<void>;
  submitFeedback(input: {
    entryId: string;
    problemType: string;
    description: string;
    actorId: string;
    [key: string]: unknown;
  }): Promise<{ feedbackId: string }>;
}

export type GovernanceReviewPort = ReviewPort;

export interface GovernanceReviewAdminPort {
  list(input: {
    actorId: string;
    query: FeedbackListRequest;
  }): Promise<FeedbackListResponse>;
  stats(input: { actorId: string; entryId: string }): Promise<FeedbackStatsResponse>;
  batch(input: {
    actorId: string;
    command: FeedbackBatchRequest;
  }): Promise<FeedbackBatchResponse>;
  listRemediation(input: { actorId: string }): Promise<FeedbackRemediationQueueResponse>;
  getRemediation(input: {
    actorId: string;
    entryId: string;
  }): Promise<FeedbackRemediationDetailResponse>;
  completeRemediation(input: {
    actorId: string;
    entryId: string;
    command: FeedbackRemediationCompleteRequest;
  }): Promise<FeedbackRemediationCompleteResponse>;
}

export interface GovernanceAsyncCommandPort {
  reactivateRemediation(payload: RemediationReactivationPayload): Promise<void>;
  exportBadcaseDraft(payload: BadcaseExportDraftPayload): Promise<void>;
}

export interface GovernanceConflictEntry {
  id: string;
  shortcut: string;
  detail: string;
  lifecycleState: 'approved';
}

export interface GovernanceConflictCandidateSet {
  entry: GovernanceConflictEntry;
  candidates: GovernanceConflictEntry[];
}

export interface GovernanceConflictReadPort {
  getApprovedConflictCandidates(entryId: string): Promise<GovernanceConflictCandidateSet | null>;
}

export interface GovernanceConflictWorkflowPort {
  detectConflicts(input: {
    entryId: GovernanceConflictDetectionPayload['entryId'];
  }): Promise<{ detectedCount: number }>;
}

export interface GovernanceRemediationProjection {
  entryId: string;
  remediation: FeedbackRemediationState;
}

export interface GovernanceRetrievalProjection {
  listFeedback(): Promise<FeedbackQueueRecord[]>;
  listConflicts(entryIds: string[]): Promise<ConflictRelation[]>;
  listRemediation(entryIds: string[]): Promise<GovernanceRemediationProjection[]>;
}

// ---------------------------------------------------------------------------
// Job Runtime port
// ---------------------------------------------------------------------------

export interface JobRuntimePort {
  /**
   * Schedule a named job with the given payload.
   * Returns a job ID for tracking.
   */
  schedule(
    type: string,
    payload: unknown,
    options?: {
      delayMs?: number;
      priority?: number;
      maxAttempts?: number;
      dedupeKey?: string;
    },
  ): Promise<string>;

  /**
   * Get the status of a scheduled job.
   */
  getStatus(jobId: string): Promise<{
    status: 'pending' | 'running' | 'completed' | 'failed' | 'dead';
    result?: unknown;
    error?: string;
  }>;

  /**
   * Get aggregate queue status.
   */
  getQueueStatus(): Promise<{
    pending: number;
    running: number;
    dead: number;
  }>;
}
