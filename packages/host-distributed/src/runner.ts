import process from 'node:process';

import { ALL_SERVICES } from './config/index.js';
import type { ServiceName } from './config/index.js';

export interface DistributedServiceHandle {
  config: { port: number };
  server: { close(): Promise<void> };
  db?: { close(): Promise<void> };
}

export type DistributedServiceStarter = (name: ServiceName) => Promise<DistributedServiceHandle>;

export interface DistributedServiceRunnerOptions {
  startService: DistributedServiceStarter;
}

function parseArgs(): { service: ServiceName | null } {
  const args = process.argv.slice(2);
  let service: ServiceName | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service' && args[i + 1]) {
      const name = args[i + 1] as ServiceName;
      if (!ALL_SERVICES.includes(name)) {
        console.error(`Unknown service: ${name}`);
        console.error(`Available services: ${ALL_SERVICES.join(', ')}`);
        process.exit(1);
      }
      service = name;
      i++;
    }
  }

  return { service };
}

async function closeHandle(handle: DistributedServiceHandle): Promise<void> {
  await handle.server.close();
  if (handle.db) {
    await handle.db.close();
  }
}

export async function runDistributedServices(
  options: DistributedServiceRunnerOptions,
): Promise<void> {
  const { service } = parseArgs();

  if (service) {
    console.log(`Starting service: ${service}`);
    const result = await options.startService(service);
    console.log(`Service ${service} started on port ${result.config.port}`);

    const shutdown = async () => {
      console.log(`Shutting down service: ${service}...`);
      try {
        await closeHandle(result);
      } catch (error) {
        console.error(`Error shutting down ${service}:`, error);
        process.exit(1);
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  console.log('Starting all services...');
  const handles: Array<{ name: ServiceName; handle: DistributedServiceHandle }> = [];

  for (const name of ALL_SERVICES) {
    try {
      const handle = await options.startService(name);
      handles.push({ name, handle });
      console.log(`  ${name} started on port ${handle.config.port}`);
    } catch (error) {
      console.error(`  Failed to start ${name}:`, error);
      process.exit(1);
    }
  }

  console.log(`All ${handles.length} services started.`);

  const shutdown = async () => {
    console.log('Shutting down all services...');
    await Promise.all(
      handles.map(async ({ name, handle }) => {
        try {
          await closeHandle(handle);
        } catch (error) {
          console.error(`Error shutting down ${name}:`, error);
        }
      }),
    );
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
