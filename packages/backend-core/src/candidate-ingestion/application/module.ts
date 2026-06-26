/**
 * Candidate-ingestion bounded context — application layer.
 *
 * Owns candidate submission, processing pipeline, dedup and resolution.
 * Result publication is delegated to the knowledge-write port.
 */

import type { CandidateStatus, CandidateSubmission } from '@trapmap/contracts';

import { InvocationError } from '../../invocation/invocation-model.js';
import type { AuditLogPort } from '../../ports/audit-ports.js';
import type {
  CandidateIngestionPort,
  JobRuntimePort,
  KnowledgeWritePort,
} from '../../ports/internal-ports.js';
import type { CandidateRepositoryPort } from '../../ports/repo-ports.js';

import { CANDIDATE_INGESTION_OWNED_CAPABILITIES } from '../domain/index.js';

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
      await deps.candidateRepo.updateStatus(candidateId, 'resolved');
      await deps.auditLog.record({
        action: 'candidate.resolve',
        actorId,
        entityId: candidateId,
        metadata: { resolution },
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
