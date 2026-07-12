import type { ReviewPort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { type GovernanceReviewDeps, createGovernanceReviewServiceModule } from './deps.js';
import { type GovernanceReviewReadinessOptions, registerGovernanceReviewRoutes } from './routes.js';

export interface GovernanceReviewServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface GovernanceReviewServer {
  app: FastifyInstance;
  module: ReviewPort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createGovernanceReviewServer(
  config: GovernanceReviewServiceConfig,
  deps: GovernanceReviewDeps,
  readinessOptions?: GovernanceReviewReadinessOptions,
): Promise<GovernanceReviewServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createGovernanceReviewServiceModule(deps);
  registerGovernanceReviewRoutes(app, module, readinessOptions);

  return {
    app,
    module,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      await app.close();
    },
  };
}
