/**
 * Artifacts module barrel export.
 * Provides artifact creation, conversion, and repository access.
 *
 * @module artifacts
 */

// Export existing functions from model.ts for backward compatibility
export * from '@trapmap/server/lib/artifacts/model.js';

// Export new repository types and functions
export * from './repository.js';

// Export PostgreSQL repository implementation
export * from './pg-repository.js';
