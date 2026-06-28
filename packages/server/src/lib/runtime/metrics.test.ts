import { describe, expect, it } from 'vitest';

import {
  getAverageLatencyMs,
  getAverageOutboxBacklog,
  getAverageQueueBacklog,
  getAverageStaleWorkers,
  getRuntimeMetricsSnapshot,
  recordRuntimeBacklog,
  recordRuntimeExecution,
  recordRuntimeReclaim,
  recordRuntimeRetry,
  resetRuntimeMetrics,
} from './metrics.js';

describe('runtime metrics', () => {
  it('records logical executions separately from retries and degraded terminal outcomes', () => {
    resetRuntimeMetrics();

    recordRuntimeRetry('graph-bootstrap');
    recordRuntimeReclaim('graph-bootstrap', 2);
    recordRuntimeExecution({
      dependencyName: 'graph-bootstrap',
      degraded: true,
      failureKind: 'retryable',
    });

    const snapshot = getRuntimeMetricsSnapshot();
    expect(snapshot.totals.executions).toBe(1);
    expect(snapshot.totals.retries).toBe(1);
    expect(snapshot.totals.degraded).toBe(1);
    expect(snapshot.totals.reclaims).toBe(2);
    expect(snapshot.dependencies['graph-bootstrap']).toMatchObject({
      executions: 1,
      retries: 1,
      reclaims: 2,
      degraded: 1,
      retryableFailures: 1,
    });
  });

  it('counts timeout and permanent failures as terminal logical outcomes', () => {
    resetRuntimeMetrics();

    recordRuntimeExecution({
      dependencyName: 'queue-runtime',
      failureKind: 'timeout',
    });
    recordRuntimeExecution({
      dependencyName: 'queue-runtime',
      failureKind: 'permanent',
    });

    const snapshot = getRuntimeMetricsSnapshot();
    expect(snapshot.dependencies['queue-runtime']).toMatchObject({
      executions: 2,
      timeouts: 1,
      permanentFailures: 1,
      retries: 0,
    });
  });

  it('resets all counters', () => {
    resetRuntimeMetrics();
    recordRuntimeExecution({
      dependencyName: 'candidate-processing',
      failureKind: 'permanent',
    });

    resetRuntimeMetrics();
    const snapshot = getRuntimeMetricsSnapshot();
    expect(snapshot.totals).toMatchObject({
      executions: 0,
      degraded: 0,
      reclaims: 0,
      timeouts: 0,
      retryableFailures: 0,
      permanentFailures: 0,
      retries: 0,
    });
    expect(snapshot.dependencies).toEqual({});
  });

  it('tracks average execution latency per dependency', () => {
    resetRuntimeMetrics();
    recordRuntimeExecution({
      dependencyName: 'badcase-export',
      latencyMs: 100,
    });
    recordRuntimeExecution({
      dependencyName: 'badcase-export',
      latencyMs: 300,
    });

    const snapshot = getRuntimeMetricsSnapshot();
    expect(snapshot.dependencies['badcase-export'].totalLatencyMs).toBe(400);
    expect(getAverageLatencyMs(snapshot.dependencies['badcase-export'])).toBe(200);
  });

  it('tracks queue, outbox, and stale worker backlog samples per dependency', () => {
    resetRuntimeMetrics();

    recordRuntimeBacklog({
      dependencyName: 'async-operator-status',
      queueBacklog: 3,
      outboxBacklog: 2,
      staleWorkers: 1,
    });
    recordRuntimeBacklog({
      dependencyName: 'async-operator-status',
      queueBacklog: 1,
      outboxBacklog: 4,
      staleWorkers: 0,
    });

    const snapshot = getRuntimeMetricsSnapshot();
    expect(snapshot.dependencies['async-operator-status']).toMatchObject({
      queueBacklogSamples: 2,
      queueBacklogTotal: 4,
      outboxBacklogSamples: 2,
      outboxBacklogTotal: 6,
      staleWorkerSamples: 2,
      staleWorkerTotal: 1,
    });
    expect(getAverageQueueBacklog(snapshot.dependencies['async-operator-status'])).toBe(2);
    expect(getAverageOutboxBacklog(snapshot.dependencies['async-operator-status'])).toBe(3);
    expect(getAverageStaleWorkers(snapshot.dependencies['async-operator-status'])).toBe(0.5);
  });
});
