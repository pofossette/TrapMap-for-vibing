import type { TaskStatus } from '../enum-types/task-queue.js';

export interface Task<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: TaskStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  dedupeKey: string | null;
  processAfter: Date;
  workerId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface DequeueOptions {
  workerId?: string;
}

export interface TaskQueueStatusSnapshot {
  pending: number;
  running: number;
  dead: number;
  staleRunning: number;
  backlogOldestAgeSeconds: number | null;
  runningOldestAgeSeconds: number | null;
  deadOldestAgeSeconds: number | null;
  reclaimCount: number;
  recentDeadLetters: Task[];
}

export interface TaskHandler<T = unknown> {
  type: string;
  handle: (task: Task<T>, signal: AbortSignal) => Promise<void>;
  onDead?: (task: Task<T>) => Promise<void> | void;
}

export interface TaskWorkerQueue {
  dequeue<T>(type: string): Promise<Task<T> | null>;
  complete(taskId: string): Promise<void>;
  fail(taskId: string, error: string): Promise<void>;
  getDeadTasks(limit: number): Promise<Task[]>;
}

export interface TaskWorkerControllerConfig {
  queue: TaskWorkerQueue;
  handlers: TaskHandler<unknown>[];
  pollIntervalMs?: number;
  concurrency?: number;
  ownsWork?: boolean;
}

export interface TaskWorkerConfig<TPool = unknown> {
  pool: TPool;
  handlers: TaskHandler<unknown>[];
  pollIntervalMs?: number;
  concurrency?: number;
  ownsWork?: boolean;
}

export function createTaskWorkerController(config: TaskWorkerControllerConfig) {
  const { queue, handlers, pollIntervalMs = 1000, concurrency = 1, ownsWork = true } = config;
  const handlerMap = new Map(handlers.map((handler) => [handler.type, handler]));
  const activeTasks = new Set<Promise<void>>();
  let running = false;
  let runPromise: Promise<void> | null = null;

  async function processOneTask(): Promise<boolean> {
    for (const [type, handler] of handlerMap) {
      if (!running) return false;
      const task = await queue.dequeue<unknown>(type);
      if (!task) continue;

      const controller = new AbortController();
      const taskPromise = new Promise<void>((resolve) => {
        (async () => {
          try {
            await handler.handle(task, controller.signal);
            await queue.complete(task.id);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await queue.fail(task.id, errorMessage);
            const deadTask = (await queue.getDeadTasks(1)).find((item) => item.id === task.id);
            if (deadTask && handler.onDead) await handler.onDead(deadTask);
          } finally {
            activeTasks.delete(taskPromise);
            resolve();
          }
        })();
      });
      activeTasks.add(taskPromise);
      return true;
    }
    return false;
  }

  async function run(): Promise<void> {
    if (runPromise) return runPromise;

    runPromise = (async () => {
      running = true;
      while (running) {
        while (running && activeTasks.size < concurrency) {
          if (!(await processOneTask())) break;
        }
        if (!running) break;
        if (activeTasks.size >= concurrency || !(await processOneTask())) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }
      await Promise.all(activeTasks);
    })();

    try {
      await runPromise;
    } finally {
      runPromise = null;
      running = false;
    }
  }

  async function stop(): Promise<void> {
    running = false;
    if (runPromise) await runPromise;
  }

  return {
    run,
    stop,
    isRunning: () => running,
    ownsWork: () => ownsWork,
  };
}

export function createTaskWorkerFromQueue<TPool>(
  config: TaskWorkerConfig<TPool>,
  createQueue: (pool: TPool) => TaskWorkerQueue,
) {
  return createTaskWorkerController({
    queue: createQueue(config.pool),
    handlers: config.handlers,
    pollIntervalMs: config.pollIntervalMs,
    concurrency: config.concurrency,
    ownsWork: config.ownsWork,
  });
}
