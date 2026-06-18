import { pathToFileURL } from 'node:url';

import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { resolveDeploymentPreset } from './lib/runtime/deployment-preset.js';
import type { RuntimeMode } from './lib/runtime/runtime-contract.js';
import { resolveServiceUnit } from './lib/runtime/service-unit.js';

function resolveWorkerRuntimeMode(): RuntimeMode {
  const mode = process.env.RUNTIME_MODE;
  if (mode === 'task-worker' || mode === 'outbox-worker' || mode === 'combined') {
    return mode;
  }
  return 'combined';
}

async function startWorker() {
  const config = loadConfig();
  const preset = resolveDeploymentPreset(config.deployment.preset);
  const runtimeMode = preset?.runtimeMode ?? resolveWorkerRuntimeMode();
  const serviceUnit = resolveServiceUnit(
    preset?.serviceUnit ?? process.env.TRAPMAP_SERVICE_UNIT,
  );

  if (
    config.asyncTaskTransport.provider === 'rabbitmq' &&
    runtimeMode !== 'task-worker' &&
    runtimeMode !== 'combined'
  ) {
    throw new Error('RabbitMQ task transport requires a task-capable runtime mode');
  }

  const server = buildServer({ runtimeMode, serviceUnit });
  await server.ready();
  server.log.info({ runtimeMode, serviceUnit }, 'Worker runtime started');
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  startWorker().catch((error: unknown) => {
    console.error('Failed to start TrapMap worker runtime', error);
    process.exitCode = 1;
  });
}
