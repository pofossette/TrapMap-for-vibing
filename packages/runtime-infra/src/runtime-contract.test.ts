import { describe, expect, it } from 'vitest';

import {
  snapshotRuntimeWorker,
  shouldBootApiRuntime,
  shouldBootOutboxWorker,
  shouldBootTaskWorker,
  shouldOwnAsyncWork,
} from './runtime-contract.js';

describe('runtime contract', () => {
  it('maps boot predicates by runtime mode', () => {
    expect(shouldBootApiRuntime('api')).toBe(true);
    expect(shouldBootApiRuntime('combined')).toBe(true);
    expect(shouldBootApiRuntime('task-worker')).toBe(false);

    expect(shouldBootTaskWorker('task-worker')).toBe(true);
    expect(shouldBootTaskWorker('combined')).toBe(true);
    expect(shouldBootTaskWorker('outbox-worker')).toBe(false);

    expect(shouldBootOutboxWorker('outbox-worker')).toBe(true);
    expect(shouldBootOutboxWorker('combined')).toBe(true);
    expect(shouldBootOutboxWorker('api')).toBe(false);
  });

  it('derives async ownership by worker kind', () => {
    expect(shouldOwnAsyncWork('combined', 'queue')).toBe(true);
    expect(shouldOwnAsyncWork('task-worker', 'queue')).toBe(true);
    expect(shouldOwnAsyncWork('api', 'queue')).toBe(false);
    expect(shouldOwnAsyncWork('outbox-worker', 'outbox')).toBe(true);
    expect(shouldOwnAsyncWork('api', 'outbox')).toBe(false);
  });

  it('snapshots worker owner and running state defensively', () => {
    expect(snapshotRuntimeWorker(undefined)).toEqual({ owner: undefined, running: false });
    expect(
      snapshotRuntimeWorker({
        ownsWork: () => true,
        isRunning: () => true,
        stop() {},
      }),
    ).toEqual({ owner: true, running: true });
  });
});
