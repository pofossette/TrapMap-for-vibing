import type { KnowledgeWritePort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerArtifactRoutes } from './artifact-routes.js';
import {
  type ComposedKnowledgeWriteDeps,
  type KnowledgeWriteDeps,
  createKnowledgeWriteServiceModule,
} from './deps.js';
import { type KnowledgeWriteReadinessOptions, registerKnowledgeWriteRoutes } from './routes.js';

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
  deps: ComposedKnowledgeWriteDeps | KnowledgeWriteDeps,
  readinessOptions?: KnowledgeWriteReadinessOptions,
): Promise<KnowledgeWriteServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createKnowledgeWriteServiceModule(deps);
  registerKnowledgeWriteRoutes(app, module, readinessOptions);
  const artifactDeps = deps as ComposedKnowledgeWriteDeps;
  if (
    artifactDeps.artifactWriter &&
    artifactDeps.artifactReadProjection &&
    artifactDeps.artifactBundleImporter
  ) {
    registerArtifactRoutes(
      app,
      artifactDeps.artifactWriter,
      artifactDeps.artifactReadProjection,
      artifactDeps.artifactBundleImporter,
    );
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
