/**
 * Knowledge PG repository barrel.
 *
 * The PgKnowledgeRepository class and all helpers have been split into
 * focused modules under ./pg-repository/. This file re-exports for
 * backward compatibility.
 *
 * Import from './pg-repository.js' or '@trapmap/server/lib/knowledge/pg-repository.js'
 * continues to work.
 *
 * For focused imports, use the sub-path:
 *   './pg-repository/pg-knowledge-repository.js'
 *   './pg-repository/row-types.js'
 *   './pg-repository/row-mappers.js'
 *   './pg-repository/boundary-helpers.js'
 *   './pg-repository/compat-overlay.js'
 *   './pg-repository/record-reconstruction.js'
 */
export * from './pg-repository/index.js';
