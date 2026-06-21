import { describe, expect, it, vi } from 'vitest';

import type { OutboxEvent, OutboxPort, TaskQueuePort } from '@trapmap/backend-core';

import { createInProcessOutboxDispatcher } from './outbox.js';
import { createInProcessTaskWorker } from './worker.js';

describe('host-local runtime workers', () => {
  it('returns null when task worker is disabled or queue is missing', () => {
    expect(createInProcessTaskWorker(null)).toBeNull();
    expect(createInProcessTaskWorker({} as TaskQueuePort, { enabled: false })).toBeNull();
  });

  it('local task worker uses queue createConsumer and stops cleanly', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const queue: TaskQueuePort = {
      kind: 'postgres-task-queue',
      enqueue: vi.fn(),
      requeue: vi.fn(),
      getStatusSnapshot: vi.fn(),
      createConsumer: vi.fn().mockResolvedValue({
        run,
        stop,
        isRunning: () => true,
        ownsWork: () => true,
      }),
    };

    const worker = createInProcessTaskWorker(queue, {
      handlers: [],
      ownsWork: true,
    });

    expect(worker).not.toBeNull();
    await vi.waitFor(() => {
      expect(queue.createConsumer).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledTimes(1);
    });

    worker!.stop();
    await vi.waitFor(() => {
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  it('outbox dispatcher claims, dispatches, and completes events', async () => {
    const event: OutboxEvent = {
      id: 'evt_1',
      eventName: 'knowledge.approved',
      payload: { name: 'knowledge.approved' },
      aggregateId: 'entry_1',
    };
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const outbox: OutboxPort = {
      kind: 'postgres-domain-outbox',
      enqueue: vi.fn(),
      claimBatch: vi.fn().mockResolvedValueOnce([event]).mockResolvedValueOnce([]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      getStatusSnapshot: vi.fn(),
    };

    const worker = createInProcessOutboxDispatcher(outbox, {
      batchSize: 1,
      pollIntervalMs: 5,
      dispatch,
    });

    expect(worker).not.toBeNull();
    await vi.waitFor(() => {
      expect(outbox.claimBatch).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith(event);
      expect(outbox.complete).toHaveBeenCalledWith('evt_1');
    });

    worker!.stop();
  });
});
