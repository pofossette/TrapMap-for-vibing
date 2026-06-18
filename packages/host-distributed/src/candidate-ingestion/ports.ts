import type { CandidateIngestionDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '../shared/ports.js';

export function createCandidateIngestionDeps(
  ports: ServicePortImplementations,
): CandidateIngestionDeps {
  return {
    candidateRepo: ports.repos.candidate,
    auditLog: ports.auditLog,
    queuePorts: ports.queuePorts,
  };
}
