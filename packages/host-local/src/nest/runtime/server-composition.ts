import { buildServer, type BuildServerOptions } from '@trapmap/server/app.js';
import { getStorePool } from '@trapmap/runtime-infra';

import type { HostLocalConfig } from '../config/index.js';
import { createHostLocalServices } from './host-services.js';

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
  options: Pick<BuildServerOptions, 'bodyLimit' | 'runtimeMode' | 'serviceUnit'> = {},
): Promise<HostLocalServer> {
  const services = await createHostLocalServices(config);
  const pool = getStorePool(services.store);
  if (!pool) {
    throw new Error('host-local server composition requires PostgreSQL');
  }

  const app = buildServer({
    config,
    ...options,
    identityBundle: services.identity,
    store: services.store,
  });

  return {
    app,
    async close() {
      await app.close();
      await pool.end();
    },
  };
}
