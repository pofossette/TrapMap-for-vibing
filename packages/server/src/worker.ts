import { pathToFileURL } from 'node:url';

import { buildServer } from './app.js';
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
  const runtimeMode = resolveWorkerRuntimeMode();
  const serviceUnit = resolveServiceUnit(process.env.TRAPMAP_SERVICE_UNIT);
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
