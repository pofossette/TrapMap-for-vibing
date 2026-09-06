export {
  buildNormalizedDuplicateInput,
  type CandidateCorpusReadPort,
  createCandidateDuplicateDetector,
  type NormalizedDuplicateInput,
} from '@trapmap/backend-core';
export { createRuleDedupStrategy } from './dedup-strategy/rule-dedup-strategy.js';
export {
  type CandidateIngestionDeps,
  type CandidateIngestionPortDeps,
  createCandidateIngestionDeps,
  createCandidateIngestionServiceModule,
} from './deps.js';
export {
  assertCandidateIngestionMigrationSet,
  runCandidateIngestionMigrations,
} from './migrations.js';
export {
  type CandidateDuplicateCaseRepository,
  type CandidateIngestionPgOwnerBundle,
  type CandidateLineageRepository,
  type CandidateResolutionOutcomeRepository,
  createCandidateIngestionPgOwnerBundle,
} from './pg-ports.js';
export {
  CANDIDATE_PROCESSING_TASK_TYPE,
  type CandidateProcessingDeps,
  type CandidateProcessingRuntime,
  type CandidateProcessingRuntimeDeps,
  type CandidateRecoveryDeps,
  createCandidateProcessingHandler,
  createCandidateProcessingRuntime,
  processCandidate,
  recoverInterruptedCandidates,
} from './processing.js';
export { createCandidateProcessingTaskQueue } from './processing-task-queue.js';
export { createCandidateIngestionRouteDefs, registerCandidateIngestionRoutes } from './routes.js';
export {
  type CandidateIngestionServer,
  type CandidateIngestionServiceConfig,
  createCandidateIngestionServer,
} from './server.js';
