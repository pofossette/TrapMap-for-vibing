import { pathToFileURL } from 'node:url';

import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { resolveRuntimeDeployment } from './lib/runtime/index.js';

async function startWorker() {
  const config = loadConfig();
  const runtimeDeployment = resolveRuntimeDeployment({
    preset: config.deployment.preset,
    ...(config.deployment.profile ? { profile: config.deployment.profile } : {}),
  });
  const runtimeMode = runtimeDeployment.runtimeMode;
  const serviceUnit = runtimeDeployment.serviceUnit;

  if (
    config.asyncTaskTransport.provider === 'rabbitmq' &&
    runtimeMode !== 'task-worker' &&
    runtimeMode !== 'combined'
  ) {
    throw new Error('RabbitMQ task transport requires a task-capable runtime mode');
  }

  const server = buildServer({ runtimeMode, serviceUnit });
  await server.ready();
  server.log.info(
    {
      deploymentProfile: runtimeDeployment.deploymentProfile,
      runtimeMode,
      serviceUnit,
    },
    'Worker runtime started',
  );
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  startWorker().catch((error: unknown) => {
    console.error('Failed to start TrapMap worker runtime', error);
    process.exitCode = 1;
  });
}
