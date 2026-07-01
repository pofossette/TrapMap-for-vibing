/**
 * Task worker that polls a PostgreSQL task queue and dispatches to handlers.
 *
 * Extracted from task-queue.ts for separation of concerns.
 */

import type { Pool } from 'pg';

import { createTaskQueue } from './task-queue.js';
import type { Task, TaskHandler } from './task-queue-schema.js';

// =============================================================================
// Task Worker Implementation
// =============================================================================

export interface TaskWorkerConfig {
  pool: Pool;
  handlers: TaskHandler[];
  /** Polling interval in ms */
  pollIntervalMs?: number;
  /** Maximum concurrent tasks */
  concurrency?: number;
  ownsWork?: boolean;
}

/**
 * Create a task worker that processes tasks from the queue.
 */
export function createTaskWorker(config: TaskWorkerConfig) {
  const { pool, handlers, pollIntervalMs = 1000, concurrency = 1, ownsWork = true } = config;

  const queue = createTaskQueue({ pool });
  const handlerMap = new Map(handlers.map((h) => [h.type, h]));
  let running = false;
  const activeTasks = new Set<Promise<void>>();
  let runPromise: Promise<void> | null = null;

  async function processOneTask(): Promise<boolean> {
    for (const [type, handler] of handlerMap) {
      const task = await queue.dequeue(type);
      if (task) {
        const controller = new AbortController();
        // Use a wrapper promise to allow self-reference for cleanup
        const taskPromise = new Promise<void>((resolve) => {
          (async () => {
            try {
              await handler.handle(task, controller.signal);
              await queue.complete(task.id);
              resolve();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await queue.fail(task.id, errorMessage);

              // Check if dead
              const deadTasks = await queue.getDeadTasks(1);
              const deadTask = deadTasks.find((t) => t.id === task.id);
              if (deadTask && handler.onDead) {
                await handler.onDead(deadTask);
              }
              resolve(); // Resolve even on error (error handled via queue.fail)
            } finally {
              activeTasks.delete(taskPromise);
            }
          })();
        });

        activeTasks.add(taskPromise);
        return true;
      }
    }
    return false;
  }

  async function run(): Promise<void> {
    if (runPromise) {
      return runPromise;
    }

    runPromise = (async () => {
      running = true;

      while (running) {
        // Process tasks up to concurrency limit
        while (activeTasks.size < concurrency) {
          const processed = await processOneTask();
          if (!processed) break;
        }

        // Wait for poll interval or any task to complete
        if (activeTasks.size >= concurrency || !(await processOneTask())) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }

      // Wait for all active tasks to complete
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
    if (runPromise) {
      await runPromise;
    }
  }

  function isRunning(): boolean {
    return running;
  }

  function workerOwnsWork(): boolean {
    return ownsWork;
  }

  return { run, stop, isRunning, ownsWork: workerOwnsWork };
}
