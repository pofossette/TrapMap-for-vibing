/**
 * Job-runtime bounded context — domain layer.
 *
 * Phase 2 target: pure runtime-substrate domain types (job states,
 * queue invariants) that do not reference any port or infrastructure
 * concern. Currently the business rules live behind the port seam; this
 * file reserves the pure-domain home for future extraction.
 */

export const JOB_RUNTIME_CONTEXT = 'job-runtime' as const;

export const JOB_RUNTIME_OWNED_CAPABILITIES = [
  'task-queue',
  'workflow-execution',
  'job-scheduling',
] as const;
