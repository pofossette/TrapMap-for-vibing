/**
 * Knowledge module barrel export.
 * Provides knowledge entry creation, conversion, and repository access.
 *
 * @module knowledge
 */

// Export existing functions from knowledge.ts for backward compatibility
export * from '../knowledge.js';

// Export new repository types and functions
export * from './repository.js';
