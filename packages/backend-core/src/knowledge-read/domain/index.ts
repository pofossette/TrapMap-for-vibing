/**
 * Knowledge-read bounded context — domain layer.
 *
 * Pure read-side judgment and assembly rules (retrieval eligibility,
 * boundary filtering, ranking merge, response assembly, tokenization,
 * refinement) with zero framework, DB or I/O imports. Performance
 * sensitive recall channels stay in the service infrastructure; they
 * render these rules over their candidate streams.
 */

export const KNOWLEDGE_READ_CONTEXT = 'knowledge-read' as const;

export const KNOWLEDGE_READ_OWNED_CAPABILITIES = [
  'knowledge-queries',
  'retrieval-search',
  'read-model',
] as const;

export * from './tokenization.js';
export * from './eligibility.js';
export * from './boundary.js';
export * from './ranking.js';
export * from './assembly.js';
export * from './refinement.js';
export * from './skill-lookup.js';
