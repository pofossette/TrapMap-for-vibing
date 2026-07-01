/**
 * Knowledge PG repository barrel.
 *
 * The PgKnowledgeRepository class and all helpers have been split into
 * focused modules under ./pg-repository/. This file re-exports for
 * backward compatibility.
 *
 * Import from './pg-repository/index.js' or '@trapmap/server/lib/knowledge/pg-repository.js'
 * continues to work.
 *
 * For focused imports, use the sub-path:
 *   './pg-repository/pg-knowledge-repository.js'  -- main class
 *   './pg-repository/row-types.js'                -- DB row type definitions
 *   './pg-repository/row-mappers.js'              -- row-to-record mapping functions
 *   './pg-repository/boundary-helpers.js'         -- boundary sub-table read/write
 *   './pg-repository/compat-overlay.js'           -- compat store merge logic
 *   './pg-repository/record-reconstruction.js'    -- reconstructKnowledgeRecord
 */

// Re-export the main class
export { PgKnowledgeRepository } from './pg-knowledge-repository.js';

// Re-export all helpers for full backward compatibility
export type {
  DrizzleKnowledgeEntryRow,
  DrizzleKnowledgeRevisionRow,
  DrizzleLifecycleEventRow,
  MaintenanceAssignmentRow,
} from './row-types.js';
export {
  rowToKnowledgeEntry,
  rowToKnowledgeRevision,
  rowToLifecycleEvent,
  rowToMaintenanceMeta,
} from './row-mappers.js';
export {
  insertBoundarySubTables,
  clearBoundarySubTables,
  loadBoundaryFromSubTables,
} from './boundary-helpers.js';
export { mergeCompatEntry } from './compat-overlay.js';
export { reconstructKnowledgeRecord } from './record-reconstruction.js';
