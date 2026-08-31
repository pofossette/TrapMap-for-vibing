import { describe, expect, it, vi } from 'vitest';

import type {
  AuditLogPort,
  JobRuntimeDeps,
  OutboxPort,
  TaskConsumerHandle,
  TaskHandler,
} from '@trapmap/backend-core';

import { JobRuntimeWorkerService } from '../../../src/nest/job-runtime/job-runtime-worker.service.js';

describe('host-local job-runtime worker', () => {
  it('registers governance handlers with the owning consumer and stops it on shutdown', async () => {
    const consumer: TaskConsumerHandle = {
      run: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(false),
      ownsWork: vi.fn().mockReturnValue(true),
    };
    const createConsumer = vi.fn().mockResolvedValue(consumer);
    const taskHandlers: TaskHandler<unknown>[] = [
      {
        type: 'governance.conflict-detection',
        handle: vi.fn().mockResolvedValue(undefined),
      },
    ];
    const deps = {
      queuePorts: {
        task: {
          kind: 'postgres-task-queue',
          enqueue: vi.fn(),
          requeue: vi.fn(),
          getStatusSnapshot: vi.fn(),
          createConsumer,
        },
        outbox: {} as OutboxPort,
      },
      auditLog: {} as AuditLogPort,
      taskHandlers,
      ownsWork: true,
    };
    const worker = new JobRuntimeWorkerService(deps);

    await worker.onModuleInit();

    expect(createConsumer).toHaveBeenCalledWith({
      handlers: taskHandlers,
      ownsWork: true,
    });
    expect(consumer.run).toHaveBeenCalledOnce();

    await worker.onModuleDestroy();

    expect(consumer.stop).toHaveBeenCalledOnce();
  });
});
