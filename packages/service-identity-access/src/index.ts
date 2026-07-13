export {
  createIdentityAccessDeps,
  createIdentityAccessServiceModule,
  type IdentityAccessDeps,
  type IdentityAccessPortDeps,
} from './deps.js';
export { registerIdentityAccessRoutes } from './routes.js';
export { assertIdentityAccessMigrationSet, runIdentityAccessMigrations } from './migrations.js';
export { createIdentityAccessPgDeps } from './pg-ports.js';
export {
  createIdentityAccessServer,
  type IdentityAccessServer,
  type IdentityAccessServiceConfig,
} from './server.js';
