export {
  createIdentityAccessDeps,
  createIdentityAccessServiceModule,
  type IdentityAccessDeps,
  type IdentityAccessPortDeps,
} from './deps.js';
export {
  createIdentityAccessRouteDefs,
  registerIdentityAccessRoutes,
} from './routes.js';
export { createAuditEvent, type CreateAuditEventArgs } from './audit.js';
export {
  buildIdentityUserLookupContext,
  buildUserLookupContextFromRepos,
  collectIdentityActorIds,
  type ActorReferencedKnowledge,
  type IdentityActorLookupSource,
  type IdentityUserLookupContext,
} from './actor-lookup.js';
export { assertIdentityAccessMigrationSet, runIdentityAccessMigrations } from './migrations.js';
export {
  createIdentityAccessActorLookupSource,
  createIdentityAccessOwnerBundle,
  createIdentityAccessPgDeps,
  createIdentityAccessSnapshotPort,
  type IdentityAccessSnapshotPort,
  type IdentityAccessSnapshotData,
  type IdentitySnapshotIdKind,
} from './pg-ports.js';
export {
  createIdentityAccessServer,
  type IdentityAccessServer,
  type IdentityAccessServiceConfig,
} from './server.js';
