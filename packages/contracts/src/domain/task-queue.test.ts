import { describe, expect, it } from 'vitest';

import { createTaskWorkerController, type TaskWorkerQueue } from './task-queue.js';

describe('createTaskWorkerController', () => {
  it('processes a task and completes it before stopping', async () => {
    const completed: string[] = [];
    const tasks = [
      {
        id: 'task-1',
        type: 'example',
        payload: { value: 1 },
        status: 'pending' as const,
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        dedupeKey: null,
        processAfter: new Date(),
        workerId: null,
        startedAt: null,
        heartbeatAt: null,
        leaseUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      },
    ];
    const queue: TaskWorkerQueue = {
      dequeue: async () => tasks.shift() ?? null,
      complete: async (taskId) => completed.push(taskId),
      fail: async () => undefined,
      getDeadTasks: async () => [],
    };
    const worker = createTaskWorkerController({
      queue,
      handlers: [
        {
          type: 'example',
          handle: async () => undefined,
        },
      ],
      pollIntervalMs: 1,
    });

    const run = worker.run();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await worker.stop();
    await run;

    expect(completed).toEqual(['task-1']);
  });
});
