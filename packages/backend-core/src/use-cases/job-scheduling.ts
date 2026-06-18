/**
 * Job scheduling use-case patterns.
 *
 * Defines the host-agnostic patterns for async job scheduling
 * and execution. These describe what jobs exist and how they
 * are scheduled, without prescribing the queue implementation.
 */

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export type JobType =
  | 'candidate-processing'
  | 'knowledge-indexing'
  | 'decay-batch'
  | 'maintenance-batch'
  | 'skill-index-follow-up'
  | 'feedback-remediation'
  | 'graph-sync';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';

export interface JobScheduleInput {
  type: JobType;
  payload: unknown;
  delayMs?: number;
  priority?: number;
  maxAttempts?: number;
  dedupeKey?: string;
}

export interface JobStatusResult {
  jobId: string;
  type: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  attempts: number;
  scheduledAt: string;
  completedAt?: string;
}

export interface JobQueueStatus {
  pending: number;
  running: number;
  dead: number;
  staleRunning: number;
}

// ---------------------------------------------------------------------------
// Job scheduling contract
// ---------------------------------------------------------------------------

/**
 * The shape of a job scheduling orchestrator.
 * Bounded-context modules implement this to provide async job capabilities.
 */
export interface JobScheduler {
  /**
   * Schedule a new job.
   */
  schedule(input: JobScheduleInput): Promise<string>;

  /**
   * Get the status of a specific job.
   */
  getJobStatus(jobId: string): Promise<JobStatusResult>;

  /**
   * Get the aggregate status of the job queue.
   */
  getQueueStatus(): Promise<JobQueueStatus>;

  /**
   * Requeue a failed or dead job for retry.
   */
  requeue(jobId: string): Promise<void>;
}
