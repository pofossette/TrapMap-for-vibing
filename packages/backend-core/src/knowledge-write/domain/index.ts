/**
 * Knowledge-write bounded context — domain layer.
 *
 * Pure domain rules (lifecycle state machine, command-to-state policy,
 * maintenance / decay eligibility) with zero framework, DB or I/O imports.
 * The application layer pre-flights commands against these rules and the
 * PostgreSQL owner enforces them inside transactions.
 */

export const KNOWLEDGE_WRITE_CONTEXT = 'knowledge-write' as const;

export const KNOWLEDGE_WRITE_OWNED_CAPABILITIES = [
  'knowledge-commands',
  'trap-commands',
  'knowledge-lifecycle',
] as const;

export * from './experience-gene-derivation.js';
export * from './experience-gene-hashing.js';
export * from './experience-gene-staleness.js';
export * from './lifecycle.js';
export * from './policy.js';
