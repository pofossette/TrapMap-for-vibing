/**
 * Candidate-ingestion bounded context — domain layer.
 *
 * Phase 2 target: pure candidate intake / normalize / dedup / resolution
 * domain types and policy helpers. Currently the business rules for this
 * context live behind the port seam; this file reserves the pure-domain
 * home for future extraction.
 */

export const CANDIDATE_INGESTION_CONTEXT = 'candidate-ingestion' as const;

export const CANDIDATE_INGESTION_OWNED_CAPABILITIES = [
  'candidate-submission',
  'candidate-processing',
  'dedup',
  'resolution',
] as const;
