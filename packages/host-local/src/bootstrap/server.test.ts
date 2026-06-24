import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildServer: vi.fn(() => ({
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  taskWorkerStop: vi.fn().mockResolvedValue(undefined),
  outboxWorkerStop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@trapmap/server', () => ({
  buildServer: mocks.buildServer,
}));

import { bootstrap } from './server.js';

vi.mock('../runtime/index.js', () => ({
  createInProcessTaskWorker: vi.fn(() => ({
    isRunning: () => true,
    ownsWork: () => true,
    stop: mocks.taskWorkerStop,
  })),
  createInProcessOutboxDispatcher: vi.fn(() => ({
    isRunning: () => true,
    ownsWork: () => true,
    stop: mocks.outboxWorkerStop,
  })),
}));

describe('host-local bootstrap', () => {
  it('closes managed runtime workers before shutting down the server', async () => {
    const handle = await bootstrap({
      port: 0,
      host: '127.0.0.1',
      logLevel: 'silent',
      runtimeMode: 'combined',
      taskQueue: {
        kind: 'postgres-task-queue',
        enqueue: vi.fn(),
        requeue: vi.fn(),
        getStatusSnapshot: vi.fn(),
        createConsumer: vi.fn(),
      },
      outbox: {
        kind: 'postgres-domain-outbox',
        enqueue: vi.fn(),
        claimBatch: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
        getStatusSnapshot: vi.fn(),
      },
      dispatchOutboxEvent: vi.fn().mockResolvedValue(undefined),
      taskHandlers: [],
    });

    await expect(handle.close()).resolves.toBeUndefined();
    expect(mocks.buildServer).toHaveBeenCalledOnce();
    expect(mocks.taskWorkerStop).toHaveBeenCalledOnce();
    expect(mocks.outboxWorkerStop).toHaveBeenCalledOnce();
  });
});
