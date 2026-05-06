/**
 * Usage analytics module barrel export.
 * Provides analytics repository interface and implementations.
 *
 * @module analytics
 */

// Export repository interface and factory
export * from './repository.js';

// Export PostgreSQL repository implementation
export * from './pg-repository.js';
