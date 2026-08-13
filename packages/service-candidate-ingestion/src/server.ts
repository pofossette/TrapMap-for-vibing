import type { CandidateIngestionPort } from '@trapmap/backend-core';
import { createFastifyAdapter } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { type CandidateIngestionDeps, createCandidateIngestionServiceModule } from './deps.js';
import { createCandidateIngestionRouteDefs } from './routes.js';

export interface CandidateIngestionServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface CandidateIngestionServer {
  app: FastifyInstance;
  module: CandidateIngestionPort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createCandidateIngestionServer(
  config: CandidateIngestionServiceConfig,
  deps: CandidateIngestionDeps,
): Promise<CandidateIngestionServer> {
  const module = createCandidateIngestionServiceModule(deps);
  const app = createFastifyAdapter(createCandidateIngestionRouteDefs(module), module, {
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
