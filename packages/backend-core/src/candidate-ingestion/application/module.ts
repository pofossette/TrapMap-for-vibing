/**
 * Candidate-ingestion bounded context — application layer.
 *
 * Owns candidate submission, processing pipeline, dedup and resolution.
 * Result publication is delegated to the knowledge-write port.
 */

import type { CandidateStatus, CandidateSubmission } from '@trapmap/contracts';

import { InvocationError } from '@trapmap/backend-core/invocation/invocation-model.js';
import type { AuditLogPort } from '@trapmap/backend-core/ports/audit-ports.js';
import type {
  CandidateIngestionPort,
  JobRuntimePort,
  KnowledgeWritePort,
} from '@trapmap/backend-core/ports/internal-ports.js';
import type { CandidateRepositoryPort } from '@trapmap/backend-core/ports/repo-ports.js';

import { CANDIDATE_INGESTION_OWNED_CAPABILITIES } from '@trapmap/backend-core/candidate-ingestion/domain/index.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface CandidateIngestionDeps {
  candidateRepo: CandidateRepositoryPort;
  auditLog: AuditLogPort;
  knowledgeWrite: Pick<KnowledgeWritePort, 'publishCandidateResult'>;
  jobRuntime?: Pick<JobRuntimePort, 'schedule'>;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const CANDIDATE_INGESTION_MODULE = {
  name: 'candidate-ingestion' as const,
  owns: CANDIDATE_INGESTION_OWNED_CAPABILITIES,
  dependsOn: ['knowledge-write', 'job-runtime'] as const,
} as const;

/**
 * Create a CandidateIngestionPort backed by the given dependencies.
 */
export function createCandidateIngestionModule(
  deps: CandidateIngestionDeps,
): CandidateIngestionPort {
  const normalizeManualResult = (
    resolution: Record<string, unknown>,
  ): Parameters<CandidateRepositoryPort['attachManualResult']>[1] => {
    const decision = resolution.decision;
    const notes = resolution.notes;
    const mergedWith = resolution.mergedWith;

    if (decision !== 'independent' && decision !== 'merged') {
      throw InvocationError.validation(
        'Candidate resolution requires decision "independent" or "merged"',
      );
    }

    if (typeof notes !== 'string' || notes.trim().length === 0) {
      throw InvocationError.validation('Candidate resolution requires non-empty notes');
    }

    if (decision === 'merged') {
      if (
        !mergedWith ||
        typeof mergedWith !== 'object' ||
        !('entityType' in mergedWith) ||
        !('entityId' in mergedWith)
      ) {
        throw InvocationError.validation(
          'Merged candidate resolution requires mergedWith.entityType and mergedWith.entityId',
        );
      }

      const entityType = mergedWith.entityType;
      const entityId = mergedWith.entityId;
      const entityTitle =
        'entityTitle' in mergedWith && typeof mergedWith.entityTitle === 'string'
          ? mergedWith.entityTitle
          : undefined;

      if ((entityType !== 'trap' && entityType !== 'skill') || typeof entityId !== 'string') {
        throw InvocationError.validation(
          'Merged candidate resolution requires a valid mergedWith target',
        );
      }

      return {
        decision,
        notes,
        mergedWith: {
          entityType,
          entityId,
          ...(entityTitle ? { entityTitle } : {}),
        },
      };
    }

    return {
      decision,
      notes,
    };
  };

  return {
    async submit(candidate: CandidateSubmission) {
      await deps.candidateRepo.insert(candidate);

      await deps.auditLog.record({
        action: 'candidate.submit',
        actorId: candidate.submittedBy,
        entityId: candidate.id,
      });

      if (deps.jobRuntime) {
        await deps.jobRuntime.schedule('candidate-processing', {
          candidateId: candidate.id,
        });
      }

      return { candidateId: candidate.id };
    },

    async getById(candidateId: string) {
      return deps.candidateRepo.getById(candidateId);
    },

    async listByStatus(status: CandidateStatus) {
      return deps.candidateRepo.listByStatus(status);
    },

    async applyResolution(candidateId, resolution, actorId) {
      const candidate = await deps.candidateRepo.getById(candidateId);
      if (!candidate) {
        throw InvocationError.notFound(`Candidate not found: ${candidateId}`);
      }

      const manualResult =
        candidate.manualResult ?? normalizeManualResult(resolution as Record<string, unknown>);

      if (!candidate.manualResult) {
        await deps.candidateRepo.attachManualResult(candidateId, manualResult, actorId);
      }

      await deps.knowledgeWrite.publishCandidateResult({
        candidateId,
        actorId,
        result: manualResult as Record<string, unknown>,
      });

      await deps.candidateRepo.markResolved(candidateId, actorId);
      await deps.auditLog.record({
        action: 'candidate.resolve',
        actorId,
        entityId: candidateId,
        metadata: { resolution: manualResult },
      });
    },

    async submitManualResult(candidateId, result, actorId) {
      const candidate = await deps.candidateRepo.getById(candidateId);
      if (!candidate) {
        throw InvocationError.notFound(`Candidate not found: ${candidateId}`);
      }
      await deps.candidateRepo.attachManualResult(
        candidateId,
        result as Parameters<CandidateRepositoryPort['attachManualResult']>[1],
        actorId,
      );
      await deps.auditLog.record({
        action: 'candidate.manual-result',
        actorId,
        entityId: candidateId,
      });
    },

    async publishCandidateResult(candidateId, result, actorId) {
      const candidate = await deps.candidateRepo.getById(candidateId);
      if (!candidate) {
        throw InvocationError.notFound(`Candidate not found: ${candidateId}`);
      }

      const publishResult = await deps.knowledgeWrite.publishCandidateResult({
        candidateId,
        actorId,
        result,
      });

      await deps.candidateRepo.markResolved(candidateId, actorId);
      await deps.auditLog.record({
        action: 'candidate.publish-result',
        actorId,
        entityId: candidateId,
        metadata: { result },
      });

      return publishResult;
    },
  };
}
