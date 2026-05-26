/**
 * Persistence schema barrel.
 *
 * All table and sequence definitions have been split into domain modules
 * under ./schema/. This file re-exports everything for backward compatibility.
 *
 * Import from '@trapmap/server/lib/persistence/schema.js' continues to work.
 * For domain-specific imports, use the sub-path:
 *   '@trapmap/server/lib/persistence/schema/auth.js'
 *   '@trapmap/server/lib/persistence/schema/knowledge.js'
 *   '@trapmap/server/lib/persistence/schema/artifacts.js'
 *   '@trapmap/server/lib/persistence/schema/candidates.js'
 *   '@trapmap/server/lib/persistence/schema/retrieval.js'
 *   '@trapmap/server/lib/persistence/schema/queue.js'
 */
export * from './schema/index.js';
