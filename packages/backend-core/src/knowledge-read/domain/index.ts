/**
 * Knowledge-read bounded context — domain layer.
 *
 * Phase 2 target: pure read-side domain types. Currently this context is
 * fully expressed through its port seam; this file reserves the pure
 * domain home for future extraction.
 */

export const KNOWLEDGE_READ_CONTEXT = 'knowledge-read' as const;

export const KNOWLEDGE_READ_OWNED_CAPABILITIES = [
  'knowledge-queries',
  'retrieval-search',
  'read-model',
] as const;
