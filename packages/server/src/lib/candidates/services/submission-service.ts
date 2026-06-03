/**
 * Submission service for candidate routes.
 *
 * Handles candidate record creation and enqueueing for async processing.
 * Separated from route handlers to keep request parsing distinct from
 * business orchestration.
 *
 * @module candidates/services/submission
 */

import { randomUUID } from 'node:crypto';
import type { CandidateSubmission, DuplicateCase } from '@trapmap/contracts';
import {
  type CandidateProcessorServices,
  scheduleCandidateProcessing,
} from '@trapmap/server/lib/candidates/processor.js';
import type { CandidateRepository } from '@trapmap/server/lib/candidates/repository.js';
import { buildNormalizedDuplicateInput } from '@trapmap/server/lib/candidates/fingerprint.js';
import { createDuplicateCaseId } from '@trapmap/server/lib/ids.js';
import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

/** Dependencies required by the submission service. */
export interface SubmissionDeps {
  store: SkillShareerStore;
  repos: SkillShareerServices['repos'];
  config: SkillShareerServices['config'];
}

/**
 * Run fast exact-fingerprint duplicate detection at ingest time.
 *
 * Queries the candidate_analyses table (indexed on fingerprint) for an
 * existing candidate with the same fingerprint. If found, creates a
 * lightweight DuplicateCase and attaches it to the new candidate.
 *
 * This is intentionally fast (single indexed query) — the full
 * Jaccard + LLM pipeline runs later via the async processor.
 *
 * @returns The duplicate case if a fingerprint match was found, or null.
 */
async function detectDuplicateOnIngest(
  candidateRepo: CandidateRepository,
  candidate: CandidateSubmission,
): Promise<DuplicateCase | null> {
  const normalized = buildNormalizedDuplicateInput(candidate);
  const existingCandidateId = await candidateRepo.findByFingerprint(normalized.fingerprint);

  if (!existingCandidateId || existingCandidateId === candidate.id) {
    return null;
  }

  const duplicateCase: DuplicateCase = {
    id: createDuplicateCaseId(),
    candidateId: candidate.id,
    detectedAt: nowIso(),
    detectionVersion: 'ingest-fingerprint-1.0.0',
    matches: [
      {
        entityType: candidate.sourceType === 'trap' ? 'trap' : 'skill',
        entityId: existingCandidateId,
        entityTitle: normalized.titleText.slice(0, 280),
        similarityScore: 1,
        matchType: 'exact' as const,
        overlapDetails: {
          sharedKeywords: normalized.keywordTerms.slice(0, 50),
          sharedTokens: normalized.tokenTerms.slice(0, 50),
          textOverlapPercent: 100,
        },
      },
    ],
    highestSimilarity: 1,
    hasExactDuplicate: true,
    duplicateType: 'exact' as const,
  };

  await candidateRepo.attachDuplicateCase(candidate.id, duplicateCase);

  return duplicateCase;
}

/**
 * Create a candidate record and enqueue it for async processing.
 *
 * @param deps - Application dependencies (store, repos, config)
 * @param auth - Resolved auth context from the request
 * @param params - Pre-validated submission parameters
 * @returns The created candidate and standardized response fields
 */
export async function createAndEnqueueCandidate(
  deps: SubmissionDeps,
  auth: ResolvedAuthContext,
  params: {
    sourceType: 'trap' | 'skill';
    scope: string;
    teamId: string | null;
    securityLevel: number;
    originalPayload: CandidateSubmission['originalPayload'];
  },
): Promise<{
  candidate: CandidateSubmission;
  response: { candidateId: string; status: string; receivedAt: string };
}> {
  const { store, repos, config } = deps;
  const { candidate: candidateRepo } = repos;

  const candidateId = `candidate_${randomUUID()}`;
  const now = new Date().toISOString();

  const candidate: CandidateSubmission = {
    id: candidateId,
    sourceType: params.sourceType,
    submittedBy: auth.user!.id,
    teamId: params.teamId,
    status: 'received',
    originalPayload: params.originalPayload,
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: now,
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
  };

  await candidateRepo.insert(candidate);

  // Fast ingest-time duplicate check (exact fingerprint match)
  const duplicateCase = await detectDuplicateOnIngest(candidateRepo, candidate);

  // Determine initial status: duplicate_detected if fingerprint match found, else queued
  const initialStatus = duplicateCase ? 'duplicate_detected' : 'queued';
  await candidateRepo.updateStatus(candidate.id, initialStatus);

  // Enqueue candidate for full async processing (Jaccard + LLM pipeline)
  // unless an exact duplicate was already detected at ingest time
  const pool = store instanceof PostgresStore ? store.getPool() : undefined;
  const services: CandidateProcessorServices = {
    store,
    getSnapshot: () => store.snapshot(),
    ...(pool ? { pool } : {}),
    candidateRepo,
  };
  if (!duplicateCase) {
    scheduleCandidateProcessing(candidate.id, services);
  }

  // Log user operation
  void logUserOperation(config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'submit',
    targetId: candidate.id,
    teamId: auth.activeTeamId,
    metadata: { sourceType: params.sourceType },
  });

  return {
    candidate: { ...candidate, status: initialStatus as any },
    response: {
      candidateId: candidate.id,
      status: initialStatus,
      receivedAt: candidate.receivedAt,
    },
  };
}
