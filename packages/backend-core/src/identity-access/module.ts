/**
 * Identity-access bounded context.
 *
 * Owns: authentication, sessions, permissions, team membership, access keys.
 *
 * This context follows the Phase 2 layered seam:
 * - `domain/` — pure types and invariants
 * - `application/` — port composition and the module factory
 * - `module.ts` — thin barrel host assemblies consume
 * - `index.ts` — context entry point
 */

export * from './application/index.js';
export * from './domain/index.js';
