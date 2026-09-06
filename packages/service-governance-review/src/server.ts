import { createFastifyServiceServer } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import {
  createGovernanceReviewServiceModule,
  type GovernanceReviewServiceDeps,
  type GovernanceReviewServiceModule,
} from './deps.js';
import {
  createGovernanceReviewRouteDefs,
  type GovernanceReviewReadinessOptions,
  type GovernanceReviewRouteDeps,
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
