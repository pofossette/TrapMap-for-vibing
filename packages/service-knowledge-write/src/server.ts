import type { KnowledgeWritePort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { type KnowledgeWriteDeps, createKnowledgeWriteServiceModule } from './deps.js';
import { type KnowledgeWriteReadinessOptions, registerKnowledgeWriteRoutes } from './routes.js';
import { registerArtifactRoutes } from './artifact-routes.js';
import type { ArtifactReadProjection, ArtifactWritePort } from './artifact-ports.js';

export interface KnowledgeWriteServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface KnowledgeWriteServer {
  app: FastifyInstance;
  module: KnowledgeWritePort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createKnowledgeWriteServer(
  config: KnowledgeWriteServiceConfig,
  deps: KnowledgeWriteDeps,
  readinessOptions?: KnowledgeWriteReadinessOptions,
): Promise<KnowledgeWriteServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createKnowledgeWriteServiceModule(deps);
  registerKnowledgeWriteRoutes(app, module, readinessOptions);
  const artifactWriter = (deps as KnowledgeWriteDeps & { artifactWriter?: ArtifactWritePort })
    .artifactWriter;
  const artifactReadProjection = (
    deps as KnowledgeWriteDeps & { artifactReadProjection?: ArtifactReadProjection }
  ).artifactReadProjection;
  if (artifactWriter && artifactReadProjection) {
    registerArtifactRoutes(app, artifactWriter, artifactReadProjection);
  }

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
