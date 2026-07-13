export {
  createIdentityAccessDeps,
  createIdentityAccessServiceModule,
  type IdentityAccessDeps,
  type IdentityAccessPortDeps,
} from './deps.js';
export { registerIdentityAccessRoutes } from './routes.js';
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
  createIdentityAccessPgDeps,
  createIdentityAccessSnapshotPort,
  type IdentityAccessActorLookupSource,
  type IdentityAccessSnapshotPort,
} from './pg-ports.js';
export {
  createIdentityAccessServer,
  type IdentityAccessServer,
  type IdentityAccessServiceConfig,
} from './server.js';
