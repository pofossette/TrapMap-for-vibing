export {
  createKnowledgeWriteDeps,
  createKnowledgeWriteServiceModule,
  type KnowledgeWriteDeps,
  type KnowledgeWritePortDeps,
} from './deps.js';
export { assertKnowledgeWriteMigrationSet, runKnowledgeWriteMigrations } from './migrations.js';
export {
  createKnowledgeWriteRouteDefs,
  registerKnowledgeWriteRoutes,
  type KnowledgeWriteReadinessOptions,
  type KnowledgeWriteRouteDeps,
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
export {
  createArtifactRouteDefs,
  registerArtifactRoutes,
  type ArtifactRouteDeps,
} from './artifact-routes.js';
export {
  migrateLegacySkillArtifacts,
  type ArtifactMigrationError,
  type ArtifactMigrationResult,
  type LegacyArtifactSnapshotOwner,
  type LegacyArtifactSnapshotRecord,
  type LegacyArtifactRevision,
  type LegacyArtifactAgentReview,
  type LegacyArtifactReviewDecision,
  type LegacyArtifactReviewNote,
  type LegacyArtifactLifecycleEvent,
  type LegacyArtifactMaintenanceMeta,
  type Wave9ArtifactBackfillConfig,
} from './wave9-artifact-backfill.js';
export { createArtifactSnapshotOwner } from './wave9-artifact-snapshot-owner.js';
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
export {
  backfillLabels,
  repairGraphDocuments,
  createPgLabelRepository,
  PgLabelRepository,
  alignLabel,
  type BackfillOptions,
  type BackfillReport,
  type LabelRepository,
  type CanonicalLabelRecord,
  type LabelAliasRecord,
  type LabelAlignmentResult,
  type MergeRepairOptions,
  type MergeRepairReport,
} from './labels/index.js';
