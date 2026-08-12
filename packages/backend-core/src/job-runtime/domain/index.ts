/**
 * Job-runtime bounded context — domain layer.
 *
 * Pure queue/outbox/worker policy rules (retry, reclaim, status decisions)
 * with zero framework, DB or I/O imports. The service infrastructure
 * renders these rules into SQL statements and worker loops.
 */

export const JOB_RUNTIME_CONTEXT = 'job-runtime' as const;

export const JOB_RUNTIME_OWNED_CAPABILITIES = [
  'task-queue',
  'workflow-execution',
  'job-scheduling',
] as const;

export * from './policy.js';
