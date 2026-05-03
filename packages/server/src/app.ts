import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Fastify from 'fastify';
import { ZodError } from 'zod';

import type { ServerConfig } from './config.js';
import { loadConfig } from './config.js';
import { createAiProviders } from './lib/ai/index.js';
import { createArtifactRepository } from './lib/artifacts/index.js';
import {
  createCandidateProcessingHandler,
  findInterruptedCandidates,
  processPendingCandidates,
  resetInterruptedCandidates,
} from './lib/candidates/index.js';
import { setGlobalEmbeddingsProvider } from './lib/embeddings.js';
import { AppError, isAppError } from './lib/errors.js';
import { buildDefaultIndexAdapters } from './lib/indexing/adapters/index.js';
import { reconcileGraphIndexes } from './lib/indexing/reconcile.js';
import { createKnowledgeRepository } from './lib/knowledge/index.js';
import { createSkillShareerStore } from './lib/persistence/create-store.js';
import { PostgresStore } from './lib/persistence/postgres-store.js';
import { type TaskHandler, createTaskWorker } from './lib/queue/task-queue.js';
import { accessKeyRoutes } from './routes/access-keys.js';
import { adminBoundarySearchRoutes } from './routes/admin-boundary-search.js';
import { authRoutes } from './routes/auth.js';
import { feedbackRoutes } from './routes/feedback.js';
import { feedbackAdminRoutes } from './routes/feedback-admin.js';
import { candidateRoutes } from './routes/candidates.js';
import { decayRoutes } from './routes/decay.js';
import { evidenceRoutes } from './routes/evidence.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { knowledgeRoutes } from './routes/knowledge.js';
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
  'POST /v1/traps',
  'GET /v1/traps',
  'GET /v1/traps/:trapId',
  'POST /v1/traps/:trapId/resubmit',
  'POST /v1/knowledge',
  'GET /v1/knowledge/mine',
  'GET /v1/knowledge/:entryId',
  'POST /v1/knowledge/:entryId/resubmit',
  'PATCH /v1/knowledge/:entryId',
  'GET /v1/knowledge/review-queue',
  'POST /v1/knowledge/review',
  'POST /v1/retrieval/search',
  'POST /v3/retrieval/search',
  'POST /v1/retrieval/skills/search-by-content',
  'GET /v1/operations/audit',
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
  'POST /admin/boundary-search',
] as const;

interface BuildServerOptions {
  config?: Partial<ServerConfig>;
  bodyLimit?: number;
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
  const app = Fastify({
    logger: isTestEnv
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
        },
    ...(options.bodyLimit === undefined ? {} : { bodyLimit: options.bodyLimit }),
  });

  app.get('/health', async () => ({
    status: 'ok',
    product: 'trapmap',
    packages: ['cli', 'server', 'contracts'],
  }));

  app.get('/meta/routes', async () => ({
    documentedRoutes,
  }));

  app.decorate('skillShareer', {
    config,
    store: createSkillShareerStore(config),
    indexAdapters: buildDefaultIndexAdapters(),
    ai: createAiProviders(config.ai),
    // knowledgeRepo is set when PostgreSQL pool is available (in onReady hook)
    knowledgeRepo: undefined,
    // artifactRepo is set when PostgreSQL pool is available (in onReady hook)
    artifactRepo: undefined,
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
  app.register(adminBoundarySearchRoutes);

  // Recovery: Reprocess interrupted candidates on startup
  app.addHook('onReady', async () => {
    try {
      const data = await app.skillShareer.store.snapshot();
      const interrupted = findInterruptedCandidates(data);

      if (interrupted.length > 0) {
        app.log.info(
          { count: interrupted.length },
          'Found interrupted candidates, scheduling recovery',
        );

        // Reset them to 'received' status
        await app.skillShareer.store.transact((txData) => {
          resetInterruptedCandidates({
            data: txData,
            reason: 'Server restart recovery',
          });
        });

        // Fire-and-forget processing
        void processPendingCandidates({
          store: app.skillShareer.store,
          getSnapshot: () => app.skillShareer.store.snapshot(),
        })
          .then(({ processed, errors }) => {
            app.log.info({ processed, errors }, 'Candidate recovery complete');
          })
          .catch((error) => {
            app.log.error({ error }, 'Candidate recovery failed');
          });
      }
    } catch (error) {
      app.log.error({ error }, 'Failed to check for interrupted candidates');
    }
  });

  // Start task worker for PostgreSQL-backed async processing
  // Only runs when using PostgresStore (databaseUrl configured)
  app.addHook('onReady', async () => {
    // Check if store is PostgreSQL-backed
    const store = app.skillShareer.store;
    if (store instanceof PostgresStore) {
      const pool = store.getPool();

      // Create knowledge repository for row-level operations
      app.skillShareer.knowledgeRepo = createKnowledgeRepository({
        pool,
        store,
      });

      // Create artifact repository for row-level operations
      app.skillShareer.artifactRepo = createArtifactRepository({
        pool,
        store,
      });

      const handler = createCandidateProcessingHandler({
        store,
        getSnapshot: () => store.snapshot(),
        pool,
        // Use PG-based duplicate detection if embeddings are configured
        usePgDuplicateDetection: () => app.skillShareer.ai.embeddings.isConfigured,
      });

      const worker = createTaskWorker({
        pool,
        handlers: [handler as TaskHandler<unknown>],
        pollIntervalMs: 1000,
        concurrency: 1,
      });

      // Start worker in background
      void worker.run();

      app.log.info('Task worker started for candidate processing');

      // Store worker reference for graceful shutdown
      app.decorate('taskWorker', worker);
    }
  });

  // Graph index reconciliation on startup (T-36-16)
  app.addHook('onReady', async () => {
    try {
      const result = await reconcileGraphIndexes({ store: app.skillShareer.store });
      app.log.info(
        { removed: result.documentsRemoved, rebuilt: result.documentsRebuilt },
        'Graph index reconciliation complete',
      );
    } catch (error) {
      app.log.error({ error }, 'Graph index reconciliation failed');
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'validation_error',
        message: error.issues.map((issue) => issue.message).join('; '),
        issues: error.issues,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      code: 'internal_error',
      message: 'Unexpected server error',
    });
  });

  return app;
}
