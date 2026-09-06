export {
  type ActorReferencedKnowledge,
  buildIdentityUserLookupContext,
  buildUserLookupContextFromRepos,
  collectIdentityActorIds,
  type IdentityActorLookupSource,
  type IdentityUserLookupContext,
} from './actor-lookup.js';
export { type CreateAuditEventArgs, createAuditEvent } from './audit.js';
export {
  createIdentityAccessDeps,
  createIdentityAccessServiceModule,
  type IdentityAccessDeps,
  type IdentityAccessPortDeps,
} from './deps.js';
export { assertIdentityAccessMigrationSet, runIdentityAccessMigrations } from './migrations.js';
export {
  createIdentityAccessActorLookupSource,
  createIdentityAccessOwnerBundle,
  createIdentityAccessPgDeps,
  createIdentityAccessSnapshotPort,
  type IdentityAccessSnapshotData,
  type IdentityAccessSnapshotPort,
  type IdentitySnapshotIdKind,
} from './pg-ports.js';
export {
  createIdentityAccessRouteDefs,
  registerIdentityAccessRoutes,
} from './routes.js';
export {
  createIdentityAccessServer,
  type IdentityAccessServer,
  type IdentityAccessServiceConfig,
} from './server.js';
