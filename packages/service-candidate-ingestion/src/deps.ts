import { createCandidateIngestionModule, type CandidateIngestionDeps } from '@trapmap/backend-core';

export { type CandidateIngestionDeps } from '@trapmap/backend-core';

export interface CandidateIngestionPortDeps {
  candidateRepo: CandidateIngestionDeps['candidateRepo'];
  auditLog: CandidateIngestionDeps['auditLog'];
  knowledgeWrite: CandidateIngestionDeps['knowledgeWrite'];
  jobRuntime?: CandidateIngestionDeps['jobRuntime'];
}

export function createCandidateIngestionDeps(
  deps: CandidateIngestionPortDeps,
): CandidateIngestionDeps {
  return {
    candidateRepo: deps.candidateRepo,
    auditLog: deps.auditLog,
    knowledgeWrite: deps.knowledgeWrite,
    ...(deps.jobRuntime ? { jobRuntime: deps.jobRuntime } : {}),
  };
}

export function createCandidateIngestionServiceModule(deps: CandidateIngestionDeps) {
  return createCandidateIngestionModule(deps);
}
