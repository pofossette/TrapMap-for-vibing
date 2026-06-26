/**
 * Governance-review compatibility shim.
 *
 * Phase 2 migration window: the business implementation has moved to
 * `../governance-review/`. This file re-exports the same public surface
 * so that existing host assemblies and service-* packages keep
 * working while they migrate to the context barrel.
 */

export * from '../governance-review/index.js';
