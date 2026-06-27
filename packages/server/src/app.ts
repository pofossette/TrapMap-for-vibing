import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';

import type { ServerConfig } from './config.js';
import { loadConfig } from './config.js';
import { createAiProviders } from './lib/ai/index.js';
import { createAsyncTransport } from './lib/async/factory.js';
import type { SkillShareerServices } from './lib/context.js';
import { setGlobalEmbeddingsProvider } from './lib/embeddings.js';
import type { GraphQueryBackend } from './lib/graph-query/backend.js';
import { createGraphQueryRuntimeState } from './lib/graph-query/config.js';
import { buildDefaultAdapterRegistry } from './lib/indexing/adapters/index.js';
import { LifecycleEventBus } from './lib/lifecycle/event-bus.js';
import { createSkillShareerStore } from './lib/persistence/create-store.js';
import { PostgresStore } from './lib/persistence/postgres-store.js';
import { ChannelRegistry } from './lib/retrieval/orchestration/channel-registry.js';
import {
  graphAssistedRecall,
  hybridRecall,
  semanticRecall,
} from './lib/retrieval/orchestration/recall-coordinator.js';
import type { RetrievalStrategy } from './lib/retrieval/orchestration/strategy-registry.js';
import { StrategyRegistry } from './lib/retrieval/orchestration/strategy-registry.js';
import { keywordChannel } from './lib/retrieval/recall/keyword.js';
import { semanticChannel } from './lib/retrieval/recall/semantic.js';
import { resolveRuntimeDeployment } from './lib/runtime/deployment-profile.js';
import { handleRuntimeError, registerRuntimeRoutes } from './lib/runtime/http-surface.js';
import { getOrCreateRequestContext } from './lib/runtime/request-context.js';
import {
  buildRouteSurfaceSummary,
  flattenDocumentedRoutes,
  getUnsupportedRouteDescriptors,
} from './lib/runtime/route-surface.js';
import type { RuntimeMode } from './lib/runtime/runtime-contract.js';
import { type ServiceUnit, resolveServiceUnit } from './lib/runtime/service-unit.js';

import { runStartupSequence } from './bootstrap/run-startup-sequence.js';
import { accessKeyRoutes } from './routes/access-keys.js';
import { adminBenchmarkRoutes } from './routes/admin-benchmark.js';
import { adminBoundarySearchRoutes } from './routes/admin-boundary-search.js';
import { authRoutes } from './routes/auth.js';
import { candidateRoutes } from './routes/candidates.js';
import { decayRoutes } from './routes/decay.js';
import { evidenceRoutes } from './routes/evidence.js';
import { feedbackAdminRoutes } from './routes/feedback-admin.js';
import { feedbackRoutes } from './routes/feedback.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { memberRoutes } from './routes/members.js';
import { operationsRoutes } from './routes/operations.js';
import { retrievalRoutes } from './routes/retrieval.js';
import { teamRoutes } from './routes/teams.js';
import { trapRoutes } from './routes/traps.js';

interface BuildServerOptions {
  config?: Partial<ServerConfig>;
  bodyLimit?: number;
  runtimeMode?: RuntimeMode;
  serviceUnit?: ServiceUnit;
}

async function registerCapabilityRoutes(app: FastifyInstance, config: ServerConfig) {
  const capabilities = config.deployment.resolved.capabilities;

  if (!capabilities.exposesGateway) {
    return;
  }

  await app.register(retrievalRoutes);

  if (capabilities.routeSurface === 'minimal-agent') {
    return;
  }

  await app.register(authRoutes);
  await app.register(teamRoutes);
  await app.register(memberRoutes);
  await app.register(accessKeyRoutes);
  await app.register(trapRoutes);
  await app.register(knowledgeRoutes);
  await app.register(candidateRoutes);

  if (!capabilities.supportsReviewGovernance) {
    return;
  }

  await app.register(evidenceRoutes);
  await app.register(operationsRoutes);
  await app.register(decayRoutes);
  await app.register(maintenanceRoutes);
  await app.register(feedbackRoutes);
  await app.register(feedbackAdminRoutes);
  await app.register(adminBenchmarkRoutes);
  await app.register(adminBoundarySearchRoutes);
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
    reply.header(config.runtime.requestIdHeader, context.requestId);
    if (context.traceId) {
      reply.header(config.runtime.traceHeaderName, context.traceId);
    }
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

  // Graceful shutdown: stop background workers
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
    if (store instanceof PostgresStore) {
      await store.close();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    return handleRuntimeError(app, config, error, request, reply);
  });

  return app;
}
