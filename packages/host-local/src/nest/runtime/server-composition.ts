import { buildServer, type BuildServerOptions } from '@trapmap/server/app.js';
import { getStorePool } from '@trapmap/runtime-infra';
import { createJobRuntimeModule } from '@trapmap/backend-core';
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';

import type { HostLocalConfig } from '../config/index.js';
import { createHostLocalServices } from './host-services.js';
import { createQueuePorts } from './backend-core-adapters.js';

export interface HostLocalServer {
  app: ReturnType<typeof buildServer>;
  close(): Promise<void>;
}

/**
 * Compose the compatibility server from the host-owned PostgreSQL store and
 * identity bundle. The host owns the pool lifecycle, so the Fastify app closes
 * before the owner pool is released.
 */
export async function buildHostLocalServer(
  config: HostLocalConfig,
  options: Pick<BuildServerOptions, 'bodyLimit' | 'config' | 'runtimeMode' | 'serviceUnit'> = {},
): Promise<HostLocalServer> {
  const services = await createHostLocalServices(config);
  const pool = getStorePool(services.store);
  if (!pool) {
    throw new Error('host-local server composition requires PostgreSQL');
  }

  const app = buildServer({
    ...options,
    config: {
      ...config,
      ...options.config,
      runtime: { ...config.runtime, ...options.config?.runtime },
      deployment: { ...config.deployment, ...options.config?.deployment },
    },
    identityBundle: services.identity,
    knowledgeOwner: services.knowledgeOwner,
    artifactReadProjection: services.artifactReadProjection,
    governanceRetrievalProjection: services.governanceReview.retrievalProjection,
    store: services.store,
    jobRuntime: createJobRuntimeModule(
      createJobRuntimeDeps({
        queuePorts: createQueuePorts(services.asyncTransport),
        auditLog: services.identity.auditLog,
      }),
    ),
    ownsStore: false,
  });
  const closeApp = app.close.bind(app);

  return {
    app,
    async close() {
      await closeApp();
      await pool.end();
    },
  };
}
