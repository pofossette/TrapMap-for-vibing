import type { FastifyInstance } from 'fastify';

import { createFastifyAdapter } from './adapters/fastify.js';
import type { RouteDef } from './route-contract.js';

export interface ServiceServerConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface ServiceServer<M> {
  app: FastifyInstance;
  module: M;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createFastifyServiceServer<M>(
  config: ServiceServerConfig,
  module: M,
  routeDefs: RouteDef[],
  deps: unknown,
): Promise<ServiceServer<M>> {
  const app = createFastifyAdapter(routeDefs, deps, {
    logger: { level: config.logLevel },
  });

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
