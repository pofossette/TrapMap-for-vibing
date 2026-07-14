import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Fastify from 'fastify';

import type { ServerConfig } from './config.js';
import { loadConfig } from './config.js';
import { createAiProviders } from './lib/ai/index.js';
import { createAsyncTransport } from './lib/async/factory.js';
import type { IdentityCompatibilityBundle, SkillShareerServices } from './lib/context.js';
import { setGlobalEmbeddingsProvider } from './lib/embeddings.js';
import { type GraphQueryBackend, createGraphQueryRuntimeState } from './lib/graph-query/index.js';
import { buildDefaultAdapterRegistry } from './lib/indexing/adapters/index.js';
import { LifecycleEventBus } from './lib/lifecycle/index.js';
import { createSkillShareerStore } from './lib/persistence/create-store.js';
import {
  ChannelRegistry,
  StrategyRegistry,
  hybridRecall,
  orchestrateGraphAssistedRecall,
  semanticRecall,
} from './lib/retrieval/orchestration/index.js';
import type { RetrievalStrategy } from './lib/retrieval/orchestration/index.js';
import { keywordChannel } from './lib/retrieval/recall/keyword.js';
import { semanticChannel } from './lib/retrieval/recall/semantic.js';
import {
  type ServiceUnit,
  buildRouteSurfaceSummary,
  flattenDocumentedRoutes,
  getUnsupportedRouteDescriptors,
  handleRuntimeError,
  registerHttpRequestHooks,
  registerRuntimeRoutes,
  renderPrometheusMetrics,
  resolveRuntimeDeployment,
  resolveServiceUnit,
} from './lib/runtime/index.js';
import type { RuntimeMode } from './lib/runtime/index.js';
import { getStorePool, type SkillShareerStore } from './lib/store.js';

import { getOtelSdk, runStartupSequence } from './bootstrap/run-startup-sequence.js';
import { createTracingPortAdapter } from './lib/runtime/tracing-port-adapter.js';
import { registerCapabilityRoutes } from './routes/register-capability-routes.js';

export interface BuildServerOptions {
  config?: Partial<ServerConfig>;
  bodyLimit?: number;
  runtimeMode?: RuntimeMode;
  serviceUnit?: ServiceUnit;
  identityBundle?: IdentityCompatibilityBundle;
  store?: SkillShareerStore;
}

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
  if (!options.identityBundle) {
    throw new Error('server identity compatibility bundle must be injected by its host');
  }
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

  registerHttpRequestHooks({ app, config, runtimeServiceName, runtimeMode });

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
    store: options.store ?? createSkillShareerStore(config),
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
          return orchestrateGraphAssistedRecall(query.seed, eligibleEntries, query, services);
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
    identity: options.identityBundle,
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

  const storePool = getStorePool(app.skillShareer.store);
  if (!storePool) {
    throw new Error('server identity compatibility bridge requires PostgreSQL');
  }
  if (storePool) {
    app.skillShareer.asyncTransport = createAsyncTransport({
      config: app.skillShareer.config,
      pool: storePool,
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

    const closeStore = (store as { close?: () => Promise<void> | void }).close;
    if (typeof closeStore === 'function') {
      await closeStore.call(store);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    return handleRuntimeError(app, config, error, request, reply);
  });

  return app;
}
