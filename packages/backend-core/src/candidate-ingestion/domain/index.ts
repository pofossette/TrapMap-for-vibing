/**
 * Candidate-ingestion bounded context — domain layer.
 *
 * Pure candidate intake / normalize / dedup / resolution rules with zero
 * framework, DB or I/O imports. The application layer drives the pipeline
 * through these rules; the PostgreSQL owner persists their results.
 */

export const CANDIDATE_INGESTION_CONTEXT = 'candidate-ingestion' as const;

export const CANDIDATE_INGESTION_OWNED_CAPABILITIES = [
  'candidate-submission',
  'candidate-processing',
  'dedup',
  'resolution',
] as const;

export * from './dedup.js';
export * from './policy.js';
export * from './resolution.js';
export * from './llm-judgment.js';
