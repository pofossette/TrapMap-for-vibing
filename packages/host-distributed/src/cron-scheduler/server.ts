import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import {
  type CronServer,
  createCronOwnerBundle,
  createCronScheduler,
  createCronServer as createServiceCronServer,
} from '@trapmap/service-cron';
import { createJobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<CronServer> {
  const bundle = createCronOwnerBundle(db.pool);
  const asyncTransport = createJobRuntimeAsyncTransport({
    config: {
      asyncTaskTransport: {
        provider: 'postgres',
        rabbitmq: null,
      },
    },
    pool: db.pool,
  });
  const scheduler = createCronScheduler({
    bundle,
    transport: { task: asyncTransport.task },
  });
  const server = await createServiceCronServer(
    config,
    {
      bundle,
      transport: { task: asyncTransport.task },
      scheduler,
    },
    {
      checkDependency: async () => {
        const health = await db.healthCheck();
        if (health.status !== 'healthy') {
          return { reachable: false, detail: health.error ?? 'database unhealthy' };
        }
        return { reachable: true };
      },
    },
  );
  await scheduler.run();
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'cron-scheduler');
  return {
    ...server,
    async close() {
      await scheduler.stop();
      await server.close();
    },
  };
}
