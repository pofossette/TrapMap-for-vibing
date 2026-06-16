import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Fastify from 'fastify';

import type { ServerConfig } from './config.js';
import { loadConfig } from './config.js';
import { createAiProviders } from './lib/ai/index.js';
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
import { handleRuntimeError, registerRuntimeRoutes } from './lib/runtime/http-surface.js';
import type { RuntimeMode } from './lib/runtime/runtime-contract.js';
import { getOrCreateRequestContext } from './lib/runtime/request-context.js';

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
import { reviewRoutes } from './routes/review.js';
import { teamRoutes } from './routes/teams.js';
import { trapRoutes } from './routes/traps.js';

const documentedRoutes = [
  'POST /v1/auth/login',
  'GET /v1/auth/session',
  'POST /v1/auth/logout',
  'POST /v1/teams',
  'GET /v1/teams',
  'POST /v1/teams/select',
  'POST /v1/members',
  'PATCH /v1/members/:memberId',
  'POST /v1/access-keys',
  // Candidate management routes
  'POST /v1/candidates',
  'GET /v1/candidates',
  'GET /v1/candidates/:candidateId',
  'POST /v1/candidates/:candidateId/apply-resolution',
  'GET /v1/duplicates',
  'GET /v1/duplicates/:candidateId',
  'POST /v1/traps',
  'GET /v1/traps',
  'GET /v1/traps/:trapId',
  'POST /v1/traps/:trapId/resubmit',
  'POST /v1/traps/:trapId/supersede',
  'POST /v1/knowledge',
  'GET /v1/knowledge/mine',
  'GET /v1/knowledge/:entryId',
  'POST /v1/knowledge/:entryId/resubmit',
  'PATCH /v1/knowledge/:entryId',
  'GET /v1/knowledge/review-queue',
  'POST /v1/knowledge/review',
  'POST /v1/knowledge/:entryId/supersede',
  'POST /v1/retrieval/search',
  'POST /v3/retrieval/search',
  'POST /v1/retrieval/skills/search-by-content',
  'GET /v1/operations/audit',
  'GET /v1/operations/stats/usage',
  'GET /v1/operations/stats/hits',
  'GET /v1/operations/stats/summary',
  'POST /v1/operations/import',
  'POST /v1/operations/export',
  'GET /v1/operations/knowledge',
  'POST /v1/operations/knowledge/:entryId/deactivate',
  'POST /v1/operations/artifacts/:artifactId/edit',
  'GET /v1/operations/artifacts/:artifactId/history',
  'GET /v1/operations/artifacts/review-queue',
  'POST /v1/operations/artifacts/:artifactId/review',
  'GET /v1/duplicates/:candidateId/bundle',
  'POST /v1/candidates/:candidateId/manual-result',
  'POST /v1/feedback',
  'GET /v1/operations/feedback',
  'POST /v1/operations/feedback/batch',
  'GET /v1/operations/feedback/stats/:entryId',
  'GET /v1/operations/decay/entries',
  'POST /v1/operations/decay/batch',
  'POST /v1/operations/decay/search',
  'PATCH /v1/knowledge/:id/evidence',
  'GET /v1/operations/maintenance/entries',
  'POST /v1/operations/maintenance/batch',
  'POST /v1/admin/reconcile-knowledge-indexes',
  'POST /admin/boundary-search',
] as const;

interface BuildServerOptions {
  config?: Partial<ServerConfig>;
  bodyLimit?: number;
  runtimeMode?: RuntimeMode;
}

export function buildServer(options: BuildServerOptions = {}) {
  const runtimeMode = options.runtimeMode ?? 'combined';
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

  registerRuntimeRoutes(app, config, documentedRoutes);

  app.decorate('skillShareer', {
    config,
    runtimeMode,
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
  });

  // Bridge: wire global embeddings provider so existing generateEmbedding() callers
  // delegate through the new AI provider layer.
  setGlobalEmbeddingsProvider(app.skillShareer.ai.embeddings);

  app.register(authRoutes);
  app.register(teamRoutes);
  app.register(memberRoutes);
  app.register(accessKeyRoutes);
  app.register(reviewRoutes);
  app.register(trapRoutes);
  app.register(knowledgeRoutes);
  app.register(evidenceRoutes);
  app.register(candidateRoutes);
  app.register(retrievalRoutes);
  app.register(operationsRoutes);
  app.register(decayRoutes);
  app.register(maintenanceRoutes);
  app.register(feedbackRoutes);
  app.register(feedbackAdminRoutes);
  app.register(adminBenchmarkRoutes);
  app.register(adminBoundarySearchRoutes);

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
