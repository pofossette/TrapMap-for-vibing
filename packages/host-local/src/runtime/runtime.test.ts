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
    let releaseRun: (() => void) | null = null;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRun = resolve;
        }),
    );
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
      expect(worker!.isRunning()).toBe(true);
    });

    const stopPromise = worker!.stop();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(worker!.isRunning()).toBe(true);
    releaseRun?.();
    await stopPromise;
    expect(worker!.isRunning()).toBe(false);
  });

  it('task worker drains when stop is requested before the consumer finishes booting', async () => {
    let resolveConsumer: ((value: {
      run(): Promise<void>;
      stop(): Promise<void>;
      isRunning(): boolean;
      ownsWork(): boolean;
    }) => void) | null = null;
    const run = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const queue: TaskQueuePort = {
      kind: 'postgres-task-queue',
      enqueue: vi.fn(),
      requeue: vi.fn(),
      getStatusSnapshot: vi.fn(),
      createConsumer: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveConsumer = resolve;
          }),
      ),
    };

    const worker = createInProcessTaskWorker(queue, { handlers: [] });
    const stopPromise = worker!.stop();

    resolveConsumer?.({
      run,
      stop,
      isRunning: () => true,
      ownsWork: () => true,
    });

    await stopPromise;
    expect(run).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(worker!.isRunning()).toBe(false);
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

    await worker!.stop();
  });

  it('outbox dispatcher drains in-flight work before stopping', async () => {
    let releaseDispatch: (() => void) | null = null;
    const event: OutboxEvent = {
      id: 'evt_2',
      eventName: 'knowledge.approved',
      payload: { name: 'knowledge.approved' },
      aggregateId: 'entry_2',
    };
    const dispatch = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseDispatch = resolve;
        }),
    );
    const outbox: OutboxPort = {
      kind: 'postgres-domain-outbox',
      enqueue: vi.fn(),
      claimBatch: vi.fn().mockResolvedValueOnce([event]).mockResolvedValue([]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      getStatusSnapshot: vi.fn(),
    };

    const worker = createInProcessOutboxDispatcher(outbox, {
      batchSize: 1,
      pollIntervalMs: 50,
      dispatch,
    });

    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(event));
    const stopPromise = worker!.stop();
    expect(worker!.isRunning()).toBe(false);
    releaseDispatch?.();
    await stopPromise;
    expect(outbox.complete).toHaveBeenCalledWith('evt_2');
  });

  it('outbox dispatcher classifies failures for metrics hooks', async () => {
    const event: OutboxEvent = {
      id: 'evt_3',
      eventName: 'knowledge.failed',
      payload: { name: 'knowledge.failed' },
      aggregateId: 'entry_3',
    };
    const onEventResult = vi.fn();
    const outbox: OutboxPort = {
      kind: 'postgres-domain-outbox',
      enqueue: vi.fn(),
      claimBatch: vi.fn().mockResolvedValueOnce([event]).mockResolvedValue([]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      getStatusSnapshot: vi.fn(),
    };

    const worker = createInProcessOutboxDispatcher(outbox, {
      batchSize: 1,
      pollIntervalMs: 5,
      dispatch: vi.fn().mockRejectedValue(new Error('permanent failure')),
      classifyFailure: () => 'permanent',
      onEventResult,
    });

    await vi.waitFor(() => {
      expect(outbox.fail).toHaveBeenCalledWith('evt_3', 'permanent failure');
      expect(onEventResult).toHaveBeenCalledWith({
        eventId: 'evt_3',
        eventName: 'knowledge.failed',
        status: 'failed',
        failureKind: 'permanent',
      });
    });

    await worker!.stop();
  });
});
