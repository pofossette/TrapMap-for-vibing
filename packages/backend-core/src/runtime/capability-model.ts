/**
 * Runtime capability model — public barrel.
 *
 * Implementation is split by responsibility (Task A8, behavior-preserving move):
 * - `capability-model/types.ts`      — primitive/composite type definitions
 * - `capability-model/boot.ts`       — runtime mode boot predicates + worker snapshot
 * - `capability-model/resolution.ts` — preset/profile → mode/unit/capabilities resolution
 *
 * Consumers keep importing from this module; the export surface is unchanged.
 */

export * from './capability-model/types.js';
export * from './capability-model/boot.js';
export * from './capability-model/resolution.js';
