import { describe, expect, it, beforeEach } from 'vitest';

import { logEntrySchema, type LogEntry } from '@trapmap/contracts';

import type { RequestContext } from './request-context.js';
import {
  recordHttpRequestMetric,
  recordRuntimeExecution,
  getRuntimeMetricsSnapshot,
  resetRuntimeMetrics,
  renderPrometheusMetrics,
} from './metrics.js';
import { createTracingPortAdapter } from './tracing-port-adapter.js';

// ---------------------------------------------------------------------------
// Self-contained stubs — mirror CachedDiscovery / RoundRobinSelector behavior
// without importing from @trapmap/backend-core (not a dependency of @trapmap/server).
//
// These stubs replicate the essential contracts so the integration test
// validates cross-layer interaction, not individual layer correctness
// (which is covered by their own test suites).
// ---------------------------------------------------------------------------

interface DiscoveredService {
  id: string;
  address: string;
  port: number;
  meta?: Record<string, string>;
}

/** Minimal in-memory cache that mimics CachedDiscovery semantics. */
class StubCachedDiscovery {
  private cache = new Map<string, { instances: DiscoveredService[]; expiresAt: number }>();
  staleRecoveries = 0;
  private ttlMs: number;
  private upstreamResults: DiscoveredService[][];
  private upstreamIdx = 0;
  private upstreamError: Error | undefined;

  constructor(opts: { ttlMs: number; upstreamResults?: DiscoveredService[][] }) {
    this.ttlMs = opts.ttlMs;
    this.upstreamResults = opts.upstreamResults ?? [];
  }

  setUpstreamError(err: Error) {
    this.upstreamError = err;
  }

  async discover(serviceName: string): Promise<DiscoveredService[]> {
    const now = Date.now();
    const cached = this.cache.get(serviceName);

    if (cached && cached.expiresAt > now) {
      return cached.instances;
    }

    try {
      if (this.upstreamError) throw this.upstreamError;
      const result = this.upstreamResults[this.upstreamIdx] ?? [];
      this.upstreamIdx++;
      this.cache.set(serviceName, { instances: result, expiresAt: now + this.ttlMs });
      return result;
    } catch {
      // Stale recovery
      if (cached) {
        this.staleRecoveries++;
        return cached.instances;
      }
      throw this.upstreamError;
    }
  }
}

/** Minimal round-robin selector that mirrors RoundRobinSelector semantics. */
class StubRoundRobinSelector {
  private indices = new Map<string, number>();

  select(
    serviceName: string,
    instances: DiscoveredService[],
    unhealthyIds?: Set<string>,
  ): DiscoveredService | undefined {
    const usable = unhealthyIds ? instances.filter((i) => !unhealthyIds.has(i.id)) : instances;
    if (usable.length === 0) return undefined;
    if (usable.length === 1) return usable[0];

    const current = this.indices.get(serviceName) ?? 0;
    const idx = current % usable.length;
    this.indices.set(serviceName, idx + 1);
    return usable[idx];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstances(n: number): DiscoveredService[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `svc-${i}`,
    address: `10.0.0.${i + 1}`,
    port: 8080 + i,
  }));
}

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'trapmap',
    environment: 'test',
    message: 'Integration test event',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cross-phase integration tests
// ---------------------------------------------------------------------------

describe('observability cross-phase integration', () => {
  beforeEach(() => {
    resetRuntimeMetrics();
  });

  // =========================================================================
  // A. Metrics: recordHttpRequestMetric produces expected counter/histogram
  // =========================================================================

  describe('metrics recording', () => {
    it('recordHttpRequestMetric creates counter and histogram entries in the rendered output', () => {
      recordHttpRequestMetric({
        routeFamily: 'runtime',
        serviceName: 'gateway',
        latencyMs: 42,
        statusCode: 200,
        method: 'GET',
      });
      recordHttpRequestMetric({
        routeFamily: 'runtime',
        serviceName: 'gateway',
        latencyMs: 108,
        statusCode: 500,
        method: 'POST',
      });

      const rendered = renderPrometheusMetrics();
      expect(rendered).toContain('trapmap_runtime_http_requests_total');
      expect(rendered).toContain('trapmap_runtime_request_duration_ms_count');
      expect(rendered).toContain('trapmap_runtime_request_duration_ms_sum');
    });
  });

  // =========================================================================
  // B. Tracing: adapter creates spans and returns trace IDs
  // =========================================================================

  describe('tracing adapter', () => {
    it('returns trace ID from request context in no-op mode', () => {
      const ctx: RequestContext = {
        requestId: 'req-int-1',
        traceHeaderName: 'traceparent',
        traceId: 'abcdef1234567890abcdef1234567890',
        traceParent: '00-abcdef1234567890abcdef1234567890-00f067aa0ba902b7-00',
        method: 'GET',
        route: '/health',
      };
      const tracing = createTracingPortAdapter(() => ctx);
      expect(tracing.getCurrentTraceId()).toBe('abcdef1234567890abcdef1234567890');
    });

    it('startSpan returns a usable span handle even when OTel is unavailable', () => {
      const tracing = createTracingPortAdapter(undefined, { enabled: true });
      const span = tracing.startSpan('integration-test-span', { test: 'value' });

      expect(span).toBeDefined();
      span.setAttribute('key', 'val');
      span.recordError(new Error('test'));
      span.end(); // must not throw
    });
  });

  // =========================================================================
  // C. Logging: structured log entry conforms to LogEntry schema
  // =========================================================================

  describe('structured log entry schema', () => {
    it('validates a representative log entry through the shared schema', () => {
      const entry = makeLogEntry({
        traceId: 'abcdef1234567890abcdef1234567890',
        requestId: 'req-int-2',
        context: 'GET /health',
      });

      const parsed = logEntrySchema.safeParse(entry);
      expect(parsed.success).toBe(true);
    });

    it('rejects an entry with an invalid level', () => {
      const entry = makeLogEntry({ level: 'critical' as any });
      const parsed = logEntrySchema.safeParse(entry);
      expect(parsed.success).toBe(false);
    });

    it('rejects an entry missing required fields', () => {
      const parsed = logEntrySchema.safeParse({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'missing service and environment',
      });
      expect(parsed.success).toBe(false);
    });
  });

  // =========================================================================
  // D. Health: /health returns HealthStatus contract shape
  // =========================================================================

  describe('health contract shape', () => {
    it('health endpoint returns contract-shaped dependencies as an array', async () => {
      const { buildServer } = await import('../../app.js');
      const app = buildServer();
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('readiness');
      expect(body).toHaveProperty('liveness');
      expect(body).toHaveProperty('dependencies');

      // Dependencies must be an array of { name, status } objects
      expect(Array.isArray(body.dependencies)).toBe(true);
      for (const dep of body.dependencies) {
        expect(dep).toHaveProperty('name');
        expect(dep).toHaveProperty('status');
        expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(dep.status);
      }

      await app.close();
    });
  });

  // =========================================================================
  // E. Discovery + load balancing: cache feeds selector for round-robin
  // =========================================================================

  describe('discovery + load balancing integration', () => {
    it('cached discovery feeds instances to round-robin selector', async () => {
      const instances = makeInstances(3);
      const cached = new StubCachedDiscovery({
        ttlMs: 60_000,
        upstreamResults: [instances],
      });
      const selector = new StubRoundRobinSelector();

      const discovered = await cached.discover('candidate-service');
      expect(discovered).toHaveLength(3);

      const first = selector.select('candidate-service', discovered);
      const second = selector.select('candidate-service', discovered);
      const third = selector.select('candidate-service', discovered);
      const fourth = selector.select('candidate-service', discovered); // wraps

      expect(first?.id).toBe('svc-0');
      expect(second?.id).toBe('svc-1');
      expect(third?.id).toBe('svc-2');
      expect(fourth?.id).toBe('svc-0');
    });

    it('selector skips unhealthy instances returned by cached discovery', async () => {
      const instances = makeInstances(3);
      const cached = new StubCachedDiscovery({
        ttlMs: 60_000,
        upstreamResults: [instances],
      });
      const selector = new StubRoundRobinSelector();

      const discovered = await cached.discover('auth-service');
      const unhealthy = new Set(['svc-1']);

      const first = selector.select('auth-service', discovered, unhealthy);
      const second = selector.select('auth-service', discovered, unhealthy);

      expect(first?.id).toBe('svc-0');
      expect(second?.id).toBe('svc-2');
    });
  });

  // =========================================================================
  // Failover scenarios
  // =========================================================================

  describe('failover: tracing disabled does not break metrics', () => {
    it('recording metrics after tracing operations succeeds without errors', () => {
      // Tracing disabled (default no-op mode)
      const tracing = createTracingPortAdapter();
      const span = tracing.startSpan('test-span');
      span.end();

      // Metrics should still work
      recordRuntimeExecution({
        dependencyName: 'post-tracing-dep',
        latencyMs: 50,
        failureKind: 'timeout',
      });

      const snapshot = getRuntimeMetricsSnapshot();
      expect(snapshot.dependencies['post-tracing-dep']).toMatchObject({
        executions: 1,
        timeouts: 1,
        totalLatencyMs: 50,
      });

      const rendered = renderPrometheusMetrics();
      expect(rendered).toContain('trapmap_runtime_executions_total');
    });
  });

  describe('failover: metrics render after tracing operations', () => {
    it('renderPrometheusMetrics produces valid output after mixed metric and tracing activity', () => {
      // Interleave tracing and metrics operations
      const tracing = createTracingPortAdapter(undefined, { enabled: true });

      const span1 = tracing.startSpan('op-1');
      span1.setAttribute('key', 'val');
      span1.end();

      recordHttpRequestMetric({
        routeFamily: 'gateway-api',
        serviceName: 'gateway',
        latencyMs: 25,
        statusCode: 200,
        method: 'GET',
      });

      const span2 = tracing.startSpan('op-2');
      span2.recordError(new Error('expected'));
      span2.end();

      recordRuntimeExecution({
        dependencyName: 'queue-runtime',
        failureKind: 'permanent',
      });

      const rendered = renderPrometheusMetrics();
      expect(rendered).toContain('trapmap_runtime_http_requests_total');
      expect(rendered).toContain('trapmap_runtime_executions_total');
      // Metrics rendering must not contain tracing-specific artifacts
      expect(rendered).not.toContain('span');
      expect(rendered).not.toContain('trace');
    });
  });

  describe('failover: cached discovery returns stale data when upstream fails', () => {
    it('continues to serve stale cache after upstream errors', async () => {
      const freshInstances = makeInstances(2);
      const cached = new StubCachedDiscovery({
        ttlMs: 1,
        upstreamResults: [freshInstances],
      });
      const selector = new StubRoundRobinSelector();

      // Prime the cache
      const initial = await cached.discover('payment-service');
      expect(initial).toHaveLength(2);

      // Wait for TTL expiry
      await new Promise((r) => setTimeout(r, 5));

      // Upstream now fails
      cached.setUpstreamError(new Error('connection refused'));

      // CachedDiscovery degrades gracefully, returning stale data
      const staleResult = await cached.discover('payment-service');
      expect(staleResult).toEqual(freshInstances);
      expect(cached.staleRecoveries).toBe(1);

      // Selector still works with the stale data
      const selected = selector.select('payment-service', staleResult);
      expect(selected).toBeDefined();
      expect(selected?.address).toMatch(/^10\.0\.0\./);
    });

    it('re-throws when no stale cache and upstream fails', async () => {
      const cached = new StubCachedDiscovery({ ttlMs: 1 });
      cached.setUpstreamError(new Error('boom'));

      await expect(cached.discover('unknown-service')).rejects.toThrow('boom');
    });
  });

  describe('failover: health check aggregates dependency statuses', () => {
    it('health endpoint includes all expected dependency names', async () => {
      const { buildServer } = await import('../../app.js');
      const app = buildServer();
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = response.json();

      const depNames = body.dependencies.map((d: { name: string }) => d.name);
      expect(depNames).toContain('database');
      expect(depNames).toContain('queue-worker');
      expect(depNames).toContain('outbox-worker');
      expect(depNames).toContain('graph-query');

      await app.close();
    });
  });
});
