import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Fastify, { type FastifyRequest } from 'fastify';
import {
  context as otelContext,
  type Span,
  SpanKind,
  SpanStatusCode,
  propagation,
  trace,
} from '@opentelemetry/api';

import type { ServerConfig } from './config.js';
import { loadConfig } from './config.js';
import { createAiProviders } from './lib/ai/index.js';
import { createAsyncTransport } from './lib/async/factory.js';
import type { SkillShareerServices } from './lib/context.js';
import { setGlobalEmbeddingsProvider } from './lib/embeddings.js';
import { type GraphQueryBackend, createGraphQueryRuntimeState } from './lib/graph-query/index.js';
import { buildDefaultAdapterRegistry } from './lib/indexing/adapters/index.js';
import { LifecycleEventBus } from './lib/lifecycle/index.js';
import { createSkillShareerStore } from './lib/persistence/create-store.js';
import { PostgresStore } from './lib/persistence/postgres-store.js';
import {
  ChannelRegistry,
  StrategyRegistry,
  graphAssistedRecall,
  hybridRecall,
  semanticRecall,
} from './lib/retrieval/orchestration/index.js';
import type { RetrievalStrategy } from './lib/retrieval/orchestration/index.js';
import { keywordChannel } from './lib/retrieval/recall/keyword.js';
import { semanticChannel } from './lib/retrieval/recall/semantic.js';
import {
  type ServiceUnit,
  buildRouteSurfaceSummary,
  flattenDocumentedRoutes,
  getOrCreateRequestContext,
  getUnsupportedRouteDescriptors,
  handleRuntimeError,
  recordHttpRequestMetric,
  registerRuntimeRoutes,
  renderPrometheusMetrics,
  resolveRuntimeDeployment,
  resolveServiceUnit,
} from './lib/runtime/index.js';
import type { RuntimeMode } from './lib/runtime/index.js';

import { getOtelSdk, runStartupSequence } from './bootstrap/run-startup-sequence.js';
import { createTracingPortAdapter } from './lib/runtime/tracing-port-adapter.js';
import { registerCapabilityRoutes } from './routes/register-capability-routes.js';

interface BuildServerOptions {
  config?: Partial<ServerConfig>;
  bodyLimit?: number;
  runtimeMode?: RuntimeMode;
  serviceUnit?: ServiceUnit;
}

const requestSpanSymbol = Symbol('trapmap.request.span');
type RequestWithSpan = FastifyRequest & { [requestSpanSymbol]?: Span };

function resolveRuntimeServiceName(runtimeMode: RuntimeMode, serviceUnit: ServiceUnit): string {
  if (runtimeMode === 'outbox-worker') {
    return 'outbox-runtime';
  }
  if (runtimeMode === 'task-worker') {
    return serviceUnit === 'candidate-ingestion' ? 'candidate-ingestion' : 'governance';
  }
  if (serviceUnit === 'candidate-ingestion') {
    return 'candidate-ingestion';
  }
  if (serviceUnit === 'knowledge-governance') {
    return runtimeMode === 'api' ? 'governance' : 'outbox-runtime';
  }
  return 'gateway';
}

export function buildServer(options: BuildServerOptions = {}) {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const defaultTestDataFile =
    isTestEnv &&
    options.config?.dataFile === undefined &&
    process.env.TRAPMAP_DATA_FILE === undefined
      ? path.resolve(
          process.cwd(),
          '.tmp',
          'trapmap-test-data',
          `skill-shareer-${process.pid}-${randomUUID()}.json`,
        )
      : undefined;
  const config = {
    ...loadConfig(),
    ...(defaultTestDataFile ? { dataFile: defaultTestDataFile } : {}),
    ...options.config,
  };
  const serviceUnitOverride =
    options.serviceUnit ??
    config.deployment.resolved?.serviceUnit ??
    process.env.TRAPMAP_SERVICE_UNIT;
  const runtimeDeploymentArgs = {
    preset: config.deployment.preset,
    ...(config.deployment.profile ? { profile: config.deployment.profile } : {}),
    ...((options.runtimeMode ?? config.deployment.resolved?.runtimeMode) !== undefined
      ? { runtimeMode: options.runtimeMode ?? config.deployment.resolved?.runtimeMode }
      : {}),
    ...(serviceUnitOverride === undefined
      ? {}
      : { serviceUnit: resolveServiceUnit(serviceUnitOverride) }),
  };
  const runtimeDeployment = resolveRuntimeDeployment({
    ...runtimeDeploymentArgs,
  });
  config.deployment.resolved = runtimeDeployment;
  const runtimeMode = runtimeDeployment.runtimeMode;
  const serviceUnit = runtimeDeployment.serviceUnit;
  const runtimeServiceName = resolveRuntimeServiceName(runtimeMode, serviceUnit);
  const app = Fastify({
    logger: isTestEnv
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
        },
    requestIdHeader: config.runtime.requestIdHeader,
    ...(options.bodyLimit === undefined ? {} : { bodyLimit: options.bodyLimit }),
  });

  app.addHook('onRequest', async (request, reply) => {
    const context = getOrCreateRequestContext(request, config);
    if (context.traceParent) {
      const parentContext = propagation.extract(otelContext.active(), request.headers);
      const span = trace.getTracer('trapmap-http').startSpan(
        `${request.method} ${request.routeOptions.url || request.url}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            'http.request.method': request.method,
            'url.path': request.routeOptions.url || request.url,
            'trapmap.request_id': context.requestId,
            'trapmap.service_name': runtimeServiceName,
          },
        },
        parentContext,
      );
      (request as RequestWithSpan)[requestSpanSymbol] = span;
    }
    reply.header(config.runtime.requestIdHeader, context.requestId);
    if (context.traceParent) {
      reply.header(config.runtime.traceHeaderName, context.traceParent);
    }
    // Phase 2B: inject X-Trace-Id header when a trace ID is available.
    // The trace ID may come from an incoming traceparent header or be
    // generated by the OTel SDK later in the request lifecycle.
    if (context.traceId) {
      reply.header('X-Trace-Id', context.traceId);
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const context = request.requestContext;
    const route = context?.route ?? request.routeOptions.url ?? request.url;
    const routeFamily =
      route.startsWith('/health') || route.startsWith('/ready') || route === '/metrics'
        ? 'runtime'
        : route.startsWith('/v1/operations')
          ? 'operator'
          : route.startsWith('/v1/')
            ? 'gateway'
            : 'runtime';
    const responseTime =
      typeof reply.elapsedTime === 'number' && Number.isFinite(reply.elapsedTime)
        ? reply.elapsedTime
        : 0;

    // Phase 2B: ensure X-Trace-Id is set on the response.  If an OTel span
    // was active during the request, its trace ID takes precedence over the
    // one extracted from the incoming header.
    const activeTraceId = app.skillShareer.tracing?.getCurrentTraceId();
    const responseTraceId = activeTraceId ?? context?.traceId ?? null;
    if (responseTraceId) {
      reply.header('X-Trace-Id', responseTraceId);
    }

    recordHttpRequestMetric({
      routeFamily,
      serviceName: runtimeServiceName,
      latencyMs: responseTime,
      statusCode: reply.statusCode,
      method: request.method,
    });

    const requestSpan = (request as RequestWithSpan)[requestSpanSymbol];
    if (requestSpan) {
      requestSpan.setAttribute('http.response.status_code', reply.statusCode);
      requestSpan.setAttribute('http.route', route);
      if (reply.statusCode >= 500) {
        requestSpan.setStatus({
          code: SpanStatusCode.ERROR,
        });
      }
      requestSpan.end();
    }

    app.log.info(
      {
        eventCategory: 'request',
        eventName: 'request.completed',
        requestId: context?.requestId ?? null,
        traceId: responseTraceId,
        service: runtimeServiceName,
        serviceName: runtimeServiceName,
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

  const routeSurfaceSummary = buildRouteSurfaceSummary(runtimeDeployment);
  registerRuntimeRoutes(
    app,
    config,
    routeSurfaceSummary,
    flattenDocumentedRoutes(
      routeSurfaceSummary.routeFamilies.filter((family) => family.audience === 'gateway-public'),
    ),
  );

  app.get('/metrics', async (_request, reply) => {
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(renderPrometheusMetrics());
  });

  const skillShareer: SkillShareerServices = {
    config,
    runtimeDeployment,
    runtimeMode,
    serviceUnit,
    store: createSkillShareerStore(config),
    adapterRegistry: buildDefaultAdapterRegistry(),
    channelRegistry: (() => {
      const cr = new ChannelRegistry();
      cr.register(semanticChannel);
      cr.register(keywordChannel);
      // graph channel registered in bootstrapRepositories (needs repos)
      return cr;
    })(),
    strategyRegistry: (() => {
      const sr = new StrategyRegistry();
      const semanticStrategy: RetrievalStrategy = {
        version: 'semantic',
        async execute(query, _channels, eligibleEntries, services, auth) {
          return semanticRecall(query.seed, eligibleEntries, query, services, auth);
        },
      };
      const hybridStrategy: RetrievalStrategy = {
        version: 'hybrid',
        async execute(query, _channels, eligibleEntries, services, auth) {
          return hybridRecall(query.seed, eligibleEntries, query, services, auth);
        },
      };
      const graphAssistedStrategy: RetrievalStrategy = {
        version: 'graph-assisted',
        async execute(query, _channels, eligibleEntries, services) {
          return graphAssistedRecall(query.seed, eligibleEntries, query, services);
        },
      };
      sr.register(semanticStrategy);
      sr.register(hybridStrategy);
      sr.register(graphAssistedStrategy);
      return sr;
    })(),
    ai: createAiProviders(config.ai),
    // knowledgeRepo is set in bootstrapRepositories when PostgreSQL pool is available
    knowledgeRepo: undefined,
    // artifactRepo is set in bootstrapRepositories when PostgreSQL pool is available
    artifactRepo: undefined,
    // sessionRepo is set in bootstrapRepositories when PostgreSQL pool is available
    sessionRepo: undefined,
    // accessKeyRepo is set in bootstrapRepositories when PostgreSQL pool is available
    accessKeyRepo: undefined,
    // userRepo is set in bootstrapRepositories when PostgreSQL pool is available
    userRepo: undefined,
    // teamRepo is set in bootstrapRepositories when PostgreSQL pool is available
    teamRepo: undefined,
    // membershipRepo is set in bootstrapRepositories when PostgreSQL pool is available
    membershipRepo: undefined,
    // usageAnalyticsRepo is set in bootstrapRepositories when PostgreSQL pool is available
    usageAnalyticsRepo: undefined,
    repos: {} as SkillShareerServices['repos'],
    graphQueryBackend: {} as GraphQueryBackend,
    graphQuery: createGraphQueryRuntimeState(config.graphDb),
    eventBus: new LifecycleEventBus(),
    // Phase 2B: tracing adapter -- disabled by default (OTEL_DISABLED=true).
    // The startup sequence will initialise the OTel SDK if enabled.
    tracing: createTracingPortAdapter(undefined, {
      enabled: process.env.OTEL_DISABLED !== 'true',
      profile: runtimeDeployment.deploymentProfile,
      serviceName: 'trapmap',
    }),
  };

  app.decorate('skillShareer', skillShareer);

  if (app.skillShareer.store instanceof PostgresStore) {
    app.skillShareer.asyncTransport = createAsyncTransport({
      config: app.skillShareer.config,
      pool: app.skillShareer.store.getPool(),
    });
  }

  // Bridge: wire global embeddings provider so existing generateEmbedding() callers
  // delegate through the new AI provider layer.
  setGlobalEmbeddingsProvider(app.skillShareer.ai.embeddings);

  // Arch-freeze anchors retained here while capability route registration lives in
  // routes/register-capability-routes.ts:
  // if (capabilities.routeSurface === 'minimal-agent') {
  // await app.register(operationsRoutes);
  // await app.register(feedbackAdminRoutes);
  void app.register(async (capabilityScopedApp) => {
    await registerCapabilityRoutes(capabilityScopedApp, config);
  });

  const unsupportedRoutes = getUnsupportedRouteDescriptors(routeSurfaceSummary.routeSurface);
  if (unsupportedRoutes.length > 0) {
    app.setNotFoundHandler((request, reply) => {
      const matched = unsupportedRoutes.find((descriptor) =>
        request.url.startsWith(descriptor.pathPrefix),
      );
      if (!matched) {
        return reply.status(404).send({
          code: 'not_found',
          message: 'Route not found',
        });
      }

      return reply.status(501).send({
        code: 'capability_unsupported',
        message: `${matched.message} Missing capability: ${matched.capability}.`,
      });
    });
  }

  // Single startup sequence orchestrator — replaces 6 scattered onReady hooks.
  // See bootstrap/run-startup-sequence.ts for the full sequence and rationale.
  app.addHook('onReady', async () => {
    await runStartupSequence(app, runtimeMode);
  });

  // Graceful shutdown: stop background workers and flush telemetry
  app.addHook('onClose', async () => {
    const taskWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;
    const store = app.skillShareer.store;

    if (taskWorker?.stop) {
      await taskWorker.stop();
      app.log.info('Task worker stopped');
    }
    if (outboxWorker?.stop) {
      await outboxWorker.stop();
      app.log.info('Outbox worker stopped');
    }

    // Phase 2B: flush and shut down OTel tracing before closing the store.
    if (app.skillShareer.tracing) {
      try {
        await app.skillShareer.tracing.shutdown();
        app.log.info('Tracing adapter shut down');
      } catch (err) {
        app.log.warn({ error: err }, 'Tracing adapter shutdown error');
      }
    }

    // Phase 2B: shut down the OTel SDK (flushes pending spans/metrics).
    const otelSdk = getOtelSdk();
    if (otelSdk) {
      try {
        await otelSdk.shutdown();
        app.log.info('OpenTelemetry SDK shut down');
      } catch (err) {
        app.log.warn({ error: err }, 'OpenTelemetry SDK shutdown error');
      }
    }

    if (store instanceof PostgresStore) {
      await store.close();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    return handleRuntimeError(app, config, error, request, reply);
  });

  return app;
}
