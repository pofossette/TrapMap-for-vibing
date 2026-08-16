import { createFastifyServiceServer } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { type CronServiceDeps, type CronServiceModule, createCronServiceModule } from './deps.js';
import { type CronRouteDeps, createCronRouteDefs } from './routes.js';

export interface CronServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface CronServer {
  app: FastifyInstance;
  module: CronServiceModule;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createCronServer(
  config: CronServiceConfig,
  deps: CronServiceDeps,
  readinessOptions?: { checkDependency?: () => Promise<{ reachable: boolean; detail?: string }> },
): Promise<CronServer> {
  const module = createCronServiceModule(deps);
  const routeDeps: CronRouteDeps = { ...module, ...readinessOptions };
  return createFastifyServiceServer(config, module, createCronRouteDefs(routeDeps), routeDeps);
}
