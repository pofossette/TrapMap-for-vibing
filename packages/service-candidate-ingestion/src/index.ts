export {
  createCandidateIngestionDeps,
  createCandidateIngestionServiceModule,
  type CandidateIngestionDeps,
  type CandidateIngestionPortDeps,
} from './deps.js';
export {
  assertCandidateIngestionMigrationSet,
  runCandidateIngestionMigrations,
} from './migrations.js';
export {
  createCandidateIngestionPgOwnerBundle,
  type CandidateDuplicateCaseRepository,
  type CandidateIngestionPgOwnerBundle,
  type CandidateLineageRepository,
  type CandidateResolutionOutcomeRepository,
} from './pg-ports.js';
export {
  buildNormalizedDuplicateInput,
  createCandidateDuplicateDetector,
  type CandidateCorpusReadPort,
  type NormalizedDuplicateInput,
} from '@trapmap/backend-core';
export {
  CANDIDATE_PROCESSING_TASK_TYPE,
  createCandidateProcessingHandler,
  createCandidateProcessingRuntime,
  processCandidate,
  recoverInterruptedCandidates,
  type CandidateProcessingDeps,
  type CandidateProcessingRuntime,
  type CandidateProcessingRuntimeDeps,
  type CandidateRecoveryDeps,
} from './processing.js';
export { createCandidateProcessingTaskQueue } from './processing-task-queue.js';
export { createCandidateIngestionRouteDefs, registerCandidateIngestionRoutes } from './routes.js';
export {
  createCandidateIngestionServer,
  type CandidateIngestionServer,
  type CandidateIngestionServiceConfig,
} from './server.js';
