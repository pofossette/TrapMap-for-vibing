import { createFastifyServiceServer } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import {
  type GovernanceReviewServiceDeps,
  type GovernanceReviewServiceModule,
  createGovernanceReviewServiceModule,
} from './deps.js';
import {
  type GovernanceReviewReadinessOptions,
  type GovernanceReviewRouteDeps,
  createGovernanceReviewRouteDefs,
} from './routes.js';

export interface GovernanceReviewServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface GovernanceReviewServer {
  app: FastifyInstance;
  module: GovernanceReviewServiceModule;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createGovernanceReviewServer(
  config: GovernanceReviewServiceConfig,
  deps: GovernanceReviewServiceDeps,
  readinessOptions?: GovernanceReviewReadinessOptions,
): Promise<GovernanceReviewServer> {
  const module = createGovernanceReviewServiceModule(deps);
  const routeDeps: GovernanceReviewRouteDeps = { ...module, ...readinessOptions };
  return createFastifyServiceServer(
    config,
    module,
    createGovernanceReviewRouteDefs(routeDeps),
    routeDeps,
  );
}
