import type { CandidateIngestionDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '../shared/ports.js';

export function createCandidateIngestionDeps(
  ports: ServicePortImplementations,
): CandidateIngestionDeps {
  return {
    candidateRepo: ports.repos.candidate,
    auditLog: ports.auditLog,
    knowledgeWrite: {
      publishCandidateResult: async (input) => ({ candidateId: input.candidateId }),
    },
    jobRuntime: {
      schedule: async (type, payload, options) =>
        String(await ports.queuePorts.task.enqueue(type, payload, options)),
    },
  };
}
