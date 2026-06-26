/**
 * Knowledge-write bounded context — domain layer.
 *
 * Phase 2 target: pure domain types (knowledge lifecycle states,
 * command invariants, policy helpers) that do not reference any port or
 * infrastructure concern. Currently the write-side business rules live
 * entirely behind the port seam; this file reserves the pure-domain home
 * for future extraction.
 */

export const KNOWLEDGE_WRITE_CONTEXT = 'knowledge-write' as const;

export const KNOWLEDGE_WRITE_OWNED_CAPABILITIES = [
  'knowledge-commands',
  'trap-commands',
  'knowledge-lifecycle',
] as const;
