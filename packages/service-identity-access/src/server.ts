import type { IdentityAccessPort } from '@trapmap/backend-core';
import { createFastifyServiceServer } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { createIdentityAccessServiceModule, type IdentityAccessDeps } from './deps.js';
import { createIdentityAccessRouteDefs } from './routes.js';

export interface IdentityAccessServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface IdentityAccessServer {
  app: FastifyInstance;
  module: IdentityAccessPort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createIdentityAccessServer(
  config: IdentityAccessServiceConfig,
  deps: IdentityAccessDeps,
): Promise<IdentityAccessServer> {
  const module = createIdentityAccessServiceModule(deps);
  return createFastifyServiceServer(config, module, createIdentityAccessRouteDefs(module), module);
}
