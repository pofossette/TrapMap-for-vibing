/**
 * Candidate-ingestion bounded context.
 *
 * Owns candidate intake, normalize, dedup, analysis, resolution and
 * lineage; result publication is delegated to knowledge-write.
 */

export * from './application/index.js';
export * from './domain/index.js';
