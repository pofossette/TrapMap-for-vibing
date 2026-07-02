/**
 * Graph query barrel -- re-exports public API from graph-query module files.
 *
 * Covers backend interfaces and types, config schema/loader, memory backend,
 * Neo4j backend, projector helpers, and fail-open health wrapper.
 */

// Backend interfaces and types
export type {
  GraphQueryBackendKind,
  GraphQueryMode,
  GraphQueryBackendHealth,
  GraphQueryRuntimeState,
  GraphQueryNodeView,
  GraphQueryExpansionView,
  GraphQueryBackend,
} from './backend.js';

// Config
export type { GraphDbConfig } from './config.js';
export {
  GraphDbConfigSchema,
  loadGraphDbConfig,
  createGraphQueryRuntimeState,
} from './config.js';

// Memory backend
export { createMemoryGraphQueryBackend } from './memory-backend.js';

// Neo4j backend
export type { Neo4jGraphQueryBackendConfig } from './neo4j-backend.js';
export {
  Neo4jGraphQueryBackend,
  createNeo4jGraphQueryBackend,
} from './neo4j-backend.js';

// Projector
export type {
  ProjectedGraphSource,
  ProjectedGraphNode,
  ProjectedGraphRelationship,
  ProjectedGraphDocument,
} from './projector.js';
export {
  buildGraphSourceKey,
  normalizeGraphLabel,
  projectGraphDocument,
} from './projector.js';

// Health (fail-open wrapper)
export { createFailOpenGraphQueryBackend } from './health.js';
