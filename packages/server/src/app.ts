import Fastify from 'fastify';
import { ZodError } from 'zod';

import { loadConfig } from './config.js';
import { AppError, isAppError } from './lib/errors.js';
import { JsonStore } from './lib/store.js';
import { accessKeyRoutes } from './routes/access-keys.js';
import { authRoutes } from './routes/auth.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { memberRoutes } from './routes/members.js';
import { operationsRoutes } from './routes/operations.js';
import { retrievalRoutes } from './routes/retrieval.js';
import { reviewRoutes } from './routes/review.js';
import { teamRoutes } from './routes/teams.js';

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
  'POST /v1/knowledge',
  'GET /v1/knowledge/mine',
  'GET /v1/knowledge/:entryId',
  'POST /v1/knowledge/:entryId/resubmit',
  'PATCH /v1/knowledge/:entryId',
  'GET /v1/knowledge/review-queue',
  'POST /v1/knowledge/review',
  'POST /v1/retrieval/search',
  'GET /v1/operations/audit',
  'POST /v1/operations/import',
  'POST /v1/operations/export',
  'GET /v1/operations/knowledge',
  'POST /v1/operations/knowledge/:entryId/deactivate',
] as const;

export function buildServer() {
  const config = loadConfig();
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  app.get('/health', async () => ({
    status: 'ok',
    product: 'skill-shareer',
    packages: ['cli', 'server', 'contracts'],
  }));

  app.get('/meta/routes', async () => ({
    documentedRoutes,
  }));

  app.decorate('skillShareer', {
    config,
    store: new JsonStore(config.dataFile),
  });

  app.register(authRoutes);
  app.register(teamRoutes);
  app.register(memberRoutes);
  app.register(accessKeyRoutes);
  app.register(reviewRoutes);
  app.register(knowledgeRoutes);
  app.register(retrievalRoutes);
  app.register(operationsRoutes);

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
