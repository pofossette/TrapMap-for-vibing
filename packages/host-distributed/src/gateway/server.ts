/**
 * Gateway service server.
 *
 * The gateway is the ONLY externally-exposed service. It receives
 * public API requests and forwards them to internal services via HTTP.
 */

import { randomUUID } from 'node:crypto';

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { DynamicDiscovery } from '@trapmap/backend-core';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { RequestContext } from '@trapmap/server/lib/runtime/index.js';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { ConsulDiscoveryAdapter } from './consul-discovery-adapter.js';
import { DiscoveryResolver } from './discovery-resolver.js';
import { type InternalServiceClients, createInternalServiceClients } from './internal-client.js';
import { registerGatewayRoutes } from './routes.js';

interface CounterSample {
  value: number;
  labels: Record<string, string>;
}

interface HistogramSample {
  sum: number;
  count: number;
  labels: Record<string, string>;
}

const counters = new Map<string, Map<string, CounterSample>>();
const histograms = new Map<string, Map<string, HistogramSample>>();

function normalizeLabels(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
}

function labelKey(labels: Record<string, string>): string {
  return JSON.stringify(normalizeLabels(labels));
}

function getCounter(name: string, labels: Record<string, string>): CounterSample {
  let samples = counters.get(name);
  if (!samples) {
    samples = new Map();
    counters.set(name, samples);
  }

  const key = labelKey(labels);
  const existing = samples.get(key);
  if (existing) {
    return existing;
  }

  const next = { value: 0, labels };
  samples.set(key, next);
  return next;
}

function getHistogram(name: string, labels: Record<string, string>): HistogramSample {
  let samples = histograms.get(name);
  if (!samples) {
    samples = new Map();
    histograms.set(name, samples);
  }

  const key = labelKey(labels);
  const existing = samples.get(key);
  if (existing) {
    return existing;
  }

  const next = { sum: 0, count: 0, labels };
  samples.set(key, next);
  return next;
}

function serializeLabels(labels: Record<string, string>): string {
  const entries = Object.entries(normalizeLabels(labels));
  if (entries.length === 0) {
    return '';
  }
  return `{${entries.map(([key, value]) => `${key}="${value}"`).join(',')}}`;
}

function extractTraceId(traceParent: string): string {
  const trimmed = traceParent.trim();
  const traceParentMatch = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i.exec(trimmed);
  return traceParentMatch?.[1] ?? trimmed;
}

function getOrCreateRequestContext(request: FastifyRequest): RequestContext {
  const contextCarrier = request as FastifyRequest & {
    requestContext?: RequestContext;
  };
  if (contextCarrier.requestContext) {
    return contextCarrier.requestContext;
  }

  const requestIdHeader = request.headers['x-request-id'];
  const traceParentHeader = request.headers.traceparent;
  const requestId =
    typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0
      ? requestIdHeader.trim()
      : request.id || randomUUID();
  const traceParent =
    typeof traceParentHeader === 'string' && traceParentHeader.trim().length > 0
      ? traceParentHeader.trim()
      : null;

  const context: RequestContext = {
    requestId,
    traceHeaderName: 'traceparent',
    traceHeaderValue: traceParent,
    traceId: traceParent ? extractTraceId(traceParent) : null,
    traceParent,
    method: request.method,
    route: request.routeOptions.url || request.url,
  };

  contextCarrier.requestContext = context;
  return context;
}

function recordHttpRequestMetric(params: {
  routeFamily: string;
  serviceName: string;
  latencyMs: number;
  statusCode: number;
  method: string;
}) {
  const labels = {
    route_family: params.routeFamily,
    service_name: params.serviceName,
    method: params.method.toUpperCase(),
    status_class: `${Math.floor(params.statusCode / 100)}xx`,
    owner_surface: 'runtime-seam',
  };

  getCounter('trapmap_runtime_http_requests_total', labels).value += 1;
  const histogram = getHistogram('trapmap_runtime_request_duration_ms', labels);
  histogram.count += 1;
  histogram.sum += params.latencyMs;
}

function renderPrometheusMetrics(): string {
  const lines: string[] = [];
  const memoryUsage = process.memoryUsage();

  for (const [metricName, samples] of counters.entries()) {
    lines.push(`# TYPE ${metricName} counter`);
    for (const sample of samples.values()) {
      lines.push(`${metricName}${serializeLabels(sample.labels)} ${sample.value}`);
    }
  }

  for (const [metricName, samples] of histograms.entries()) {
    lines.push(`# TYPE ${metricName} histogram`);
    for (const sample of samples.values()) {
      lines.push(`${metricName}_count${serializeLabels(sample.labels)} ${sample.count}`);
      lines.push(`${metricName}_sum${serializeLabels(sample.labels)} ${sample.sum}`);
    }
  }

  lines.push('# TYPE trapmap_process_resident_memory_bytes gauge');
  lines.push(`trapmap_process_resident_memory_bytes ${memoryUsage.rss}`);
  lines.push('# TYPE trapmap_nodejs_heap_size_used_bytes gauge');
  lines.push(`trapmap_nodejs_heap_size_used_bytes ${memoryUsage.heapUsed}`);
  lines.push('# TYPE trapmap_nodejs_heap_size_total_bytes gauge');
  lines.push(`trapmap_nodejs_heap_size_total_bytes ${memoryUsage.heapTotal}`);

  return `${lines.join('\n')}\n`;
}

function resolveRouteFamily(route: string): string {
  if (route.startsWith('/health') || route === '/metrics') {
    return 'runtime';
  }
  if (route.startsWith('/v1/')) {
    return 'gateway';
  }
  return 'runtime';
}

// ---------------------------------------------------------------------------
// Server interface
// ---------------------------------------------------------------------------

export interface GatewayServer {
  app: FastifyInstance;
  clients: InternalServiceClients;
  start(): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the gateway server.
 *
 * The gateway does NOT have its own database. It delegates all
 * operations to internal services via HTTP.
 *
 * When `config.consulEnabled` is true, service URLs are resolved
 * dynamically via Consul (with cached discovery + static fallback).
 * Otherwise only static env-var-based URLs are used.
 */
export async function createServer(config: ServiceConfig): Promise<GatewayServer> {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: 'x-request-id',
  });
  await attachRuntimeTelemetry(app, 'gateway');

  app.addHook('onRequest', async (request, reply) => {
    const context = getOrCreateRequestContext(request);
    reply.header('x-request-id', context.requestId);
    if (context.traceParent) {
      reply.header('traceparent', context.traceParent);
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const context = getOrCreateRequestContext(request);
    const route = context.route;
    const routeFamily = resolveRouteFamily(route);
    const responseTime =
      typeof reply.elapsedTime === 'number' && Number.isFinite(reply.elapsedTime)
        ? reply.elapsedTime
        : 0;

    recordHttpRequestMetric({
      routeFamily,
      serviceName: 'gateway',
      latencyMs: responseTime,
      statusCode: reply.statusCode,
      method: request.method,
    });

    app.log.info(
      {
        eventCategory: 'request',
        eventName: 'request.completed',
        requestId: context.requestId,
        traceId: context.traceId,
        service: 'gateway',
        serviceName: 'gateway',
        ownerSurface: 'runtime-seam',
        routeFamily,
        method: request.method,
        route,
        statusCode: reply.statusCode,
        latencyMs: responseTime,
      },
      'Request completed',
    );
  });

  // Optional: set up dynamic discovery via Consul
  let resolver: DiscoveryResolver | undefined;

  if (config.consulEnabled) {
    // Adapt FastifyBaseLogger (which uses .info()) to the { warn, debug, log } shape
    const logger = {
      warn: (msg: string) => app.log.warn(msg),
      debug: (msg: string) => app.log.debug(msg),
      log: (msg: string) => app.log.info(msg),
    };

    const adapter = new ConsulDiscoveryAdapter({
      consulAddress: config.consulAddress,
      logger,
    });

    // DynamicDiscovery wraps the adapter with TTL cache + round-robin.
    // DiscoveryResolver provides the static-URL fallback layer.
    const dynamicDiscovery = new DynamicDiscovery(adapter, { cacheTTLMs: 30_000 });

    resolver = new DiscoveryResolver({
      discovery: dynamicDiscovery,
      staticUrls: config.internalUrls,
      logger,
    });

    // Register this gateway instance with Consul
    await adapter.register({
      id: `trapmap-gateway-${process.pid}`,
      name: 'gateway',
      address: config.advertiseHost,
      port: config.port,
      check: {
        http: `http://${config.advertiseHost}:${config.port}/health`,
        interval: '10s',
        timeout: '5s',
      },
      meta: {
        version: process.env.npm_package_version ?? '0.1.0',
        environment: process.env.NODE_ENV ?? 'development',
      },
    });
  }

  // Create HTTP clients for all internal services
  const clients = createInternalServiceClients(config.internalUrls, resolver);

  // Register gateway routes (external API surface)
  registerGatewayRoutes(app, clients);
  app.get('/metrics', async (_request, reply) => {
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(renderPrometheusMetrics());
  });

  return {
    app,
    clients,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      // Deregister from Consul if we registered
      if (config.consulEnabled) {
        try {
          const adapter = new ConsulDiscoveryAdapter({
            consulAddress: config.consulAddress,
            logger: {
              warn: (msg: string) => app.log.warn(msg),
              debug: (msg: string) => app.log.debug(msg),
              log: (msg: string) => app.log.info(msg),
            },
          });
          await adapter.deregister(`trapmap-gateway-${process.pid}`);
        } catch {
          // Best-effort deregistration — never block shutdown
        }
      }
      await app.close();
    },
  };
}
