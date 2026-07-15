export {
  createKnowledgeWriteDeps,
  createKnowledgeWriteServiceModule,
  type KnowledgeWriteDeps,
  type KnowledgeWritePortDeps,
} from './deps.js';
export { assertKnowledgeWriteMigrationSet, runKnowledgeWriteMigrations } from './migrations.js';
export {
  registerKnowledgeWriteRoutes,
  type KnowledgeWriteReadinessOptions,
} from './routes.js';
export {
  createKnowledgeWriteServer,
  type KnowledgeWriteServer,
  type KnowledgeWriteServiceConfig,
} from './server.js';
export {
  createKnowledgeWriteOutboxDiagnostics,
  createKnowledgeWriteOwnerBundle,
  type KnowledgeWriteOutboxDiagnostics,
  type KnowledgeWriteOwnerBundle,
} from './pg-ports.js';
export {
  createArtifactReadProjection,
  createArtifactWritePort,
  type ArtifactWritePort,
} from './artifact-ports.js';
export { registerArtifactRoutes } from './artifact-routes.js';
export {
  migrateSkillArtifacts,
  type ArtifactMigrationError,
  type ArtifactMigrationResult,
  type Wave9ArtifactBackfillConfig,
} from './wave9-artifact-backfill.js';
