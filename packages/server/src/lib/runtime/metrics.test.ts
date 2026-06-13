import { describe, expect, it } from 'vitest';

import {
  getAverageLatencyMs,
  getRuntimeMetricsSnapshot,
  recordRuntimeReclaim,
  recordRuntimeExecution,
  recordRuntimeRetry,
  resetRuntimeMetrics,
} from './metrics.js';

describe('runtime metrics', () => {
  it('records retries and degraded executions per dependency', () => {
    resetRuntimeMetrics();

    recordRuntimeRetry('graph-bootstrap');
    recordRuntimeReclaim('graph-bootstrap', 2);
    recordRuntimeExecution({
      dependencyName: 'graph-bootstrap',
      degraded: true,
      failureKind: 'retryable',
    });

    const snapshot = getRuntimeMetricsSnapshot();
    expect(snapshot.totals.retries).toBe(1);
    expect(snapshot.totals.degraded).toBe(1);
    expect(snapshot.totals.reclaims).toBe(2);
    expect(snapshot.dependencies['graph-bootstrap']).toMatchObject({
      retries: 1,
      reclaims: 2,
      degraded: 1,
      retryableFailures: 1,
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
});
