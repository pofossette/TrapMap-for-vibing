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
import type { CandidateSubmission } from '@trapmap/contracts';
import {
  type CandidateProcessorServices,
  scheduleCandidateProcessing,
} from '@trapmap/server/lib/candidates/processor.js';
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

  // Immediately update status to 'queued' -- analysis runs via worker later
  await candidateRepo.updateStatus(candidate.id, 'queued');

  // Enqueue candidate processing via PG queue (or fire-and-forget if no pool)
  const pool = store instanceof PostgresStore ? store.getPool() : undefined;
  const services: CandidateProcessorServices = {
    store,
    getSnapshot: () => store.snapshot(),
    ...(pool ? { pool } : {}),
    candidateRepo,
  };
  scheduleCandidateProcessing(candidate.id, services);

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
    candidate,
    response: {
      candidateId: candidate.id,
      status: 'queued',
      receivedAt: candidate.receivedAt,
    },
  };
}
