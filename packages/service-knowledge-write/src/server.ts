import type { KnowledgeWritePort } from '@trapmap/backend-core';
import { createFastifyAdapter, registerFastifyRoutes } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { type ArtifactRouteDeps, createArtifactRouteDefs } from './artifact-routes.js';
import {
  type ComposedKnowledgeWriteDeps,
  type KnowledgeWriteDeps,
  createKnowledgeWriteServiceModule,
} from './deps.js';
import {
  type KnowledgeWriteReadinessOptions,
  type KnowledgeWriteRouteDeps,
  createKnowledgeWriteRouteDefs,
} from './routes.js';

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
  const module = createKnowledgeWriteServiceModule(deps);
  const routeDeps: KnowledgeWriteRouteDeps = { ...module, ...readinessOptions };
  const app = createFastifyAdapter(createKnowledgeWriteRouteDefs(routeDeps), routeDeps, {
    logger: { level: config.logLevel },
  });
  const artifactDeps = deps as ComposedKnowledgeWriteDeps;
  if (
    artifactDeps.artifactWriter &&
    artifactDeps.artifactReadProjection &&
    artifactDeps.artifactBundleImporter
  ) {
    const artifactRouteDeps: ArtifactRouteDeps = {
      artifacts: artifactDeps.artifactWriter,
      readProjection: artifactDeps.artifactReadProjection,
      importer: artifactDeps.artifactBundleImporter,
    };
    registerFastifyRoutes(app, createArtifactRouteDefs(artifactRouteDeps), artifactRouteDeps);
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
