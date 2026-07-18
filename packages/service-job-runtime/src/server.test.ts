import { describe, expect, it, vi } from 'vitest';

import type { TaskHandler } from '@trapmap/backend-core';

import { createJobRuntimeDeps } from './deps.js';
import { createJobRuntimeServer } from './server.js';

function createQueuePorts(consumer: { run: () => Promise<void>; stop: () => Promise<void> }) {
  return {
    task: {
      kind: 'postgres-task-queue' as const,
      enqueue: vi.fn(),
      requeue: vi.fn(),
      getStatusSnapshot: vi.fn().mockResolvedValue({
        provider: 'postgres' as const,
        pending: 0,
        running: 0,
        dead: 0,
        staleRunning: 0,
        reclaimCount: 0,
      }),
      createConsumer: vi.fn().mockResolvedValue(consumer),
    },
    outbox: {
      kind: 'postgres-domain-outbox' as const,
      enqueue: vi.fn(),
      claimBatch: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      getStatusSnapshot: vi.fn(),
    },
  };
}

describe('job-runtime consumer ownership', () => {
  it('creates and starts the queue consumer only for an owning runtime', async () => {
    const consumer = {
      run: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const handler = {
      type: 'governance.conflict-detection',
      handle: vi.fn(),
    } as unknown as TaskHandler<unknown>;
    const queuePorts = createQueuePorts(consumer);

    const server = await createJobRuntimeServer(
      { host: '127.0.0.1', port: 0, logLevel: 'silent' },
      createJobRuntimeDeps({
        queuePorts,
        auditLog: {} as never,
        taskHandlers: [handler],
        ownsWork: true,
      }),
    );

    expect(queuePorts.task.createConsumer).toHaveBeenCalledWith({
      handlers: [handler],
      ownsWork: true,
    });
    expect(consumer.run).toHaveBeenCalledTimes(1);

    await server.close();
    expect(consumer.stop).toHaveBeenCalledTimes(1);
  });

  it('registers but does not start a consumer when the runtime does not own work', async () => {
    const consumer = {
      run: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const queuePorts = createQueuePorts(consumer);

    const server = await createJobRuntimeServer(
      { host: '127.0.0.1', port: 0, logLevel: 'silent' },
      createJobRuntimeDeps({
        queuePorts,
        auditLog: {} as never,
        taskHandlers: [],
        ownsWork: false,
      }),
    );

    expect(queuePorts.task.createConsumer).toHaveBeenCalledWith({ handlers: [], ownsWork: false });
    expect(consumer.run).not.toHaveBeenCalled();

    await server.close();
    expect(consumer.stop).toHaveBeenCalledTimes(1);
  });
});
