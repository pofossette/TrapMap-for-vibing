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
  createArtifactBundleImportPort,
  createArtifactFilePayloadOwner,
  createArtifactWritePort,
  type ArtifactBundleImportActor,
  type ArtifactBundleImportPort,
  type ArtifactFilePayloadOwner,
  type ArtifactWritePort,
} from './artifact-ports.js';
export { registerArtifactRoutes } from './artifact-routes.js';
export {
  migrateSkillArtifacts,
  type ArtifactMigrationError,
  type ArtifactMigrationResult,
  type Wave9ArtifactBackfillConfig,
} from './wave9-artifact-backfill.js';
export {
  migrateArtifactFilePayloads,
  type ArtifactFilePayloadBackfillResult,
} from './wave9-artifact-payload-backfill.js';
export {
  migrateKnowledgeSnapshot,
  type KnowledgeSnapshotBackfillResult,
  type KnowledgeSnapshotOwner,
  type LegacyKnowledgeSnapshotRecord,
} from './knowledge-snapshot-backfill.js';
export { createKnowledgeSnapshotOwner } from './knowledge-snapshot-owner.js';
