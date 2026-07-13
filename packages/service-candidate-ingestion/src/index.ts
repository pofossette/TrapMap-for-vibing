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
export { registerCandidateIngestionRoutes } from './routes.js';
export {
  createCandidateIngestionServer,
  type CandidateIngestionServer,
  type CandidateIngestionServiceConfig,
} from './server.js';
