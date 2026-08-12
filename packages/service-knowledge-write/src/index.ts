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
