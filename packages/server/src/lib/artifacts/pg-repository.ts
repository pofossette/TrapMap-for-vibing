/**
 * Artifacts PG repository barrel.
 *
 * The PgArtifactRepository class and all helpers have been split into
 * focused modules under ./pg-repository/. This file re-exports for
 * backward compatibility.
 *
 * Import from './pg-repository.js' or '@trapmap/server/lib/artifacts/pg-repository.js'
 * continues to work.
 *
 * For focused imports, use the sub-path:
 *   './pg-repository/record-reconstruction.js'
 *   './pg-repository/revision-reader.js'
 *   './pg-repository/revision-writer.js'
 *   './pg-repository/derived-store.js'
 */
export * from './pg-repository/index.js';
