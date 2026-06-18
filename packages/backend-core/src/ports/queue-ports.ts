/**
 * Queue and outbox port interfaces.
 *
 * These are the host-agnostic contracts for task queue and domain event
 * outbox access. Host assemblies wire these to PostgreSQL, RabbitMQ,
 * or in-memory implementations.
 */

// ---------------------------------------------------------------------------
// Task queue port
// ---------------------------------------------------------------------------

export interface TaskEnqueueOptions {
  priority?: number;
  maxAttempts?: number;
  delayMs?: number;
  dedupeKey?: string;
}

export interface TaskStatusSnapshot {
  provider: 'postgres' | 'rabbitmq';
  pending: number;
  running: number;
  dead: number;
  staleRunning: number;
  reclaimCount: number;
}

export interface TaskConsumerHandle {
  run(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  ownsWork(): boolean;
}

export interface TaskHandler<T> {
  type: string;
  handle(
    task: { id: string; type: string; payload: T; attempt: number },
    signal: AbortSignal,
  ): Promise<void>;
  onDead?(task: { id: string; type: string; payload: T }): Promise<void>;
}

export interface TaskQueuePort {
  kind: 'postgres-task-queue' | 'rabbitmq-task-queue';
  enqueue<T>(type: string, payload: T, options?: TaskEnqueueOptions): Promise<unknown>;
  requeue(taskId: string): Promise<void>;
  getStatusSnapshot(): Promise<TaskStatusSnapshot>;
  createConsumer?(params: {
    handlers: TaskHandler<unknown>[];
    ownsWork: boolean;
  }): Promise<TaskConsumerHandle>;
}

// ---------------------------------------------------------------------------
// Domain event outbox port
// ---------------------------------------------------------------------------

export interface OutboxEnqueueParams {
  aggregateType: string;
  aggregateId: string;
  eventName: string;
  payload: unknown;
  delayMs?: number;
}

export interface OutboxEvent {
  id: string;
  eventName: string;
  payload: unknown;
  aggregateId: string;
}

export interface OutboxStatusSnapshot {
  provider: 'postgres';
  pending: number;
  processing: number;
  failed: number;
  staleProcessing: number;
  reclaimCount: number;
}

export interface OutboxPort {
  kind: 'postgres-domain-outbox';
  enqueue(params: OutboxEnqueueParams): Promise<unknown>;
  claimBatch(limit?: number, workerId?: string): Promise<OutboxEvent[]>;
  complete(eventId: string): Promise<void>;
  fail(eventId: string, error: string): Promise<void>;
  getStatusSnapshot(): Promise<OutboxStatusSnapshot>;
}

// ---------------------------------------------------------------------------
// Workflow engine port
// ---------------------------------------------------------------------------

/**
 * A workflow engine coordinates multi-step async workflows.
 * This port is intentionally thin -- host assemblies may back it
 * with Temporal, a custom state machine, or simple sequential execution.
 */
export interface WorkflowEnginePort {
  /**
   * Start a named workflow with the given input.
   * Returns a workflow run ID.
   */
  start(workflowName: string, input: unknown): Promise<string>;

  /**
   * Query the status of a running or completed workflow.
   */
  getStatus(runId: string): Promise<'running' | 'completed' | 'failed' | 'unknown'>;

  /**
   * Cancel a running workflow.
   */
  cancel(runId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Combined async transport
// ---------------------------------------------------------------------------

export interface QueuePorts {
  task: TaskQueuePort;
  outbox: OutboxPort;
}
