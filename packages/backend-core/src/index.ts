/**
 * @trapmap/backend-core
 *
 * Host-agnostic backend core kernel for TrapMap.
 *
 * This package contains:
 * - Runtime capability model (deployment profiles, service units, topology)
 * - Application port interfaces (repos, queues, retrieval, actors, audit)
 * - Use-case patterns (commands, review flows, retrieval, job scheduling)
 * - Bounded-context modules (identity, knowledge, candidates, governance, jobs)
 * - Invocation model (sync/async contracts, error taxonomy)
 * - Testing utilities (stub implementations of all ports)
 *
 * This package does NOT depend on Fastify, pg, or any specific infrastructure.
 * Host assemblies (local-agent, team-monolith, distributed) provide concrete
 * implementations of the port interfaces defined here.
 */

// ---------------------------------------------------------------------------
// Runtime capability model
// ---------------------------------------------------------------------------
export * from './runtime/index.js';

// ---------------------------------------------------------------------------
// Port interfaces
// ---------------------------------------------------------------------------
export * from './ports/index.js';

// ---------------------------------------------------------------------------
// Bounded-context modules
// ---------------------------------------------------------------------------
export * from './identity-access/index.js';
export * from './knowledge-read/index.js';
export * from './knowledge-write/index.js';
export * from './candidate-ingestion/index.js';
export * from './governance-review/index.js';
export * from './job-runtime/index.js';

// ---------------------------------------------------------------------------
// Use-case patterns
// ---------------------------------------------------------------------------
export * from './use-cases/index.js';

// ---------------------------------------------------------------------------
// Invocation model
// ---------------------------------------------------------------------------
export * from './invocation/index.js';

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------
export * from './discovery/index.js';

// ---------------------------------------------------------------------------
// Testing utilities
// ---------------------------------------------------------------------------
export * from './testing/index.js';
