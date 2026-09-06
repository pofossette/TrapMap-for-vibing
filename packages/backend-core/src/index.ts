/**
 * @trapmap/backend-core
 *
 * Host-agnostic backend core kernel for TrapMap.
 *
 * This package contains:
 * - Runtime capability model (deployment profiles, service units, topology)
 * - Application port interfaces (repos, queues, retrieval, actors, audit)
 * - Bounded-context modules (identity, knowledge, candidates, governance, jobs)
 * - Invocation model (sync/async contracts, error taxonomy)
 * - Framework-neutral HTTP route contract + thin Nest/Fastify adapters
 * - Testing utilities (stub implementations of all ports)
 *
 * Business code does NOT depend on Fastify, pg, or any specific infrastructure.
 * The only framework-touching surface is the optional `http` adapters module.
 * Host assemblies (local-agent, team-monolith, distributed) provide concrete
 * implementations of the port interfaces defined here.
 */

export * from './candidate-ingestion/index.js';
export * from './cron/domain/index.js';
export * from './governance-review/index.js';
// ---------------------------------------------------------------------------
// HTTP route contract (framework-neutral RouteDef + Nest/Fastify adapters)
// ---------------------------------------------------------------------------
export * from './http/index.js';
// ---------------------------------------------------------------------------
// Bounded-context modules
// ---------------------------------------------------------------------------
export * from './identity-access/index.js';
// ---------------------------------------------------------------------------
// Invocation model
// ---------------------------------------------------------------------------
export * from './invocation/index.js';
export * from './job-runtime/index.js';
export * from './knowledge-read/index.js';
export * from './knowledge-write/index.js';
// ---------------------------------------------------------------------------
// Owner-local migration validation
// ---------------------------------------------------------------------------
export { assertOwnerMigrationSet } from './migrations/owner-migration-set.js';
// ---------------------------------------------------------------------------
// Shared observability plugins (OTel bootstrap + Consul HTTP adapter)
// Framework-agnostic; consumed by both host-local and host-distributed.
// ---------------------------------------------------------------------------
export * from './observability/index.js';
// ---------------------------------------------------------------------------
// Port interfaces
// ---------------------------------------------------------------------------
export * from './ports/index.js';
// ---------------------------------------------------------------------------
// Runtime capability model
// ---------------------------------------------------------------------------
export * from './runtime/index.js';
// ---------------------------------------------------------------------------
// Testing utilities
// ---------------------------------------------------------------------------
export * from './testing/index.js';
