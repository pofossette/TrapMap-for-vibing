/**
 * Candidates PG repository barrel.
 *
 * The PgCandidateRepository class and all helpers have been split into
 * focused modules under ./pg-repository/. This file re-exports for
 * backward compatibility.
 *
 * Import from './pg-repository.js' or '@trapmap/server/lib/candidates/pg-repository.js'
 * continues to work.
 *
 * For focused imports, use the sub-path:
 *   './pg-repository/pg-candidate-repository.js'  -- main class
 *   './pg-repository/row-types.js'                -- DB row type definitions
 *   './pg-repository/row-mappers.js'              -- row-to-record mapping functions
 *   './pg-repository/subtable-io.js'              -- sub-table read/write helpers
 */
export * from './pg-repository/index.js';
