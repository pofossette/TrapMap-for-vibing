import { randomUUID } from 'node:crypto';

import type { TaskHandler, TaskQueuePort } from '@trapmap/backend-core';
import type { Pool } from 'pg';

type QueueTask = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

const POLL_INTERVAL_MS = 100;

export function createCandidateProcessingTaskQueue(
  pool: Pool,
): Pick<TaskQueuePort, 'enqueue' | 'createConsumer'> {
  return {
    async enqueue(type, payload, options = {}) {
      const id = `candidate-task-${randomUUID()}`;
      const result = await pool.query(
        `INSERT INTO task_queue (
           id, type, payload, status, priority, attempts, max_attempts, dedupe_key,
           process_after, created_at, updated_at
         ) VALUES ($1, $2, $3::jsonb, 'pending', $4, 0, $5, $6, NOW(), NOW(), NOW())
         ON CONFLICT (type, dedupe_key) WHERE status IN ('pending', 'running')
         DO UPDATE SET updated_at = task_queue.updated_at
         RETURNING id`,
        [
          id,
          type,
          JSON.stringify(payload),
          options.priority ?? 0,
          options.maxAttempts ?? 3,
          options.dedupeKey ?? null,
        ],
      );
      return { id: String(result.rows[0]?.id ?? id) };
    },
    async createConsumer({ handlers, ownsWork }) {
      let stopped = false;
      let running = false;
      let cancelPollWait: (() => void) | null = null;
      const byType = new Map(handlers.map((handler) => [handler.type, handler]));

      function waitForNextPoll(): Promise<void> {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            cancelPollWait = null;
            resolve();
          }, POLL_INTERVAL_MS);
          cancelPollWait = () => {
            clearTimeout(timeout);
            cancelPollWait = null;
            resolve();
          };
        });
      }

      async function claim(): Promise<QueueTask | null> {
        const result = await pool.query<QueueTask>(
          `UPDATE task_queue
           SET status = 'running', attempts = attempts + 1, started_at = NOW(), updated_at = NOW()
           WHERE id = (
             SELECT id FROM task_queue
             WHERE type = ANY($1) AND status = 'pending' AND process_after <= NOW()
             ORDER BY priority DESC, created_at ASC
             LIMIT 1 FOR UPDATE SKIP LOCKED
           )
           RETURNING id, type, payload, attempts, max_attempts`,
          [[...byType.keys()]],
        );
        return result.rows[0] ?? null;
      }

      async function run() {
        if (running || !ownsWork) return;
        running = true;
        try {
          while (!stopped) {
            const task = await claim();
            if (!task) {
              await waitForNextPoll();
              continue;
            }
            const handler = byType.get(task.type);
            if (!handler) continue;
            try {
              await handler.handle(
                { id: task.id, type: task.type, payload: task.payload, attempt: task.attempts },
                new AbortController().signal,
              );
              await pool.query(
                `UPDATE task_queue SET status = 'completed', completed_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [task.id],
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const dead = task.attempts >= task.max_attempts;
              await pool.query(
                `UPDATE task_queue
                 SET status = $2, last_error = $3, updated_at = NOW(), process_after = NOW() + INTERVAL '5 seconds'
                 WHERE id = $1`,
                [task.id, dead ? 'dead' : 'pending', message],
              );
              if (dead) await handler.onDead?.({ id: task.id, type: task.type, payload: task.payload, attempt: task.attempts });
            }
          }
        } finally {
          running = false;
        }
      }

      return {
        run,
        async stop() {
          stopped = true;
          cancelPollWait?.();
        },
        isRunning: () => running,
        ownsWork: () => ownsWork,
      };
    },
  };
}
