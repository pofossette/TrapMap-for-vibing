/**
 * Candidate Ingestion bounded-context module.
 *
 * Owns: candidate submission, processing pipeline, dedup, resolution.
 * This module handles all candidate lifecycle operations.
 */

import type { CandidateRepositoryPort } from '../ports/repo-ports.js';
import type { CandidateIngestionPort } from '../ports/internal-ports.js';
import type { AuditLogPort } from '../ports/audit-ports.js';
import type { QueuePorts } from '../ports/queue-ports.js';
import { InvocationError } from '../invocation/invocation-model.js';
import type { CandidateStatus, CandidateSubmission } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface CandidateIngestionDeps {
  candidateRepo: CandidateRepositoryPort;
  auditLog: AuditLogPort;
  queuePorts?: QueuePorts;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const CANDIDATE_INGESTION_MODULE = {
  name: 'candidate-ingestion' as const,
  owns: ['candidate-submission', 'candidate-processing', 'dedup', 'resolution'] as const,
  dependsOn: [] as const,
} as const;

/**
 * Create a CandidateIngestionPort backed by the given dependencies.
 */
export function createCandidateIngestionModule(deps: CandidateIngestionDeps): CandidateIngestionPort {
  return {
    async submit(candidate: CandidateSubmission) {
      await deps.candidateRepo.insert(candidate);

      await deps.auditLog.record({
        action: 'candidate.submit',
        actorId: candidate.submittedBy,
        entityId: candidate.id,
      });

      // Enqueue processing task if queue is available
      if (deps.queuePorts?.task) {
        await deps.queuePorts.task.enqueue('candidate-processing', {
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
  };
}
