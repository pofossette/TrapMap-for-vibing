import { pathToFileURL } from 'node:url';

import { buildServer } from './app.js';
import type { RuntimeMode } from './lib/runtime/runtime-contract.js';
import { resolveServiceUnit } from './lib/runtime/service-unit.js';

function resolveRuntimeMode(): RuntimeMode {
  const mode = process.env.RUNTIME_MODE;
  if (mode === 'api' || mode === 'task-worker' || mode === 'outbox-worker' || mode === 'combined') {
    return mode;
  }
  return 'combined';
}

async function start() {
  const runtimeMode = resolveRuntimeMode();
  const serviceUnit = resolveServiceUnit(process.env.TRAPMAP_SERVICE_UNIT);
  const server = buildServer({ runtimeMode, serviceUnit });
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '127.0.0.1';

  await server.listen({ host, port });
  server.log.info({ host, port, runtimeMode, serviceUnit }, 'TrapMap server started');
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  start().catch((error: unknown) => {
    console.error('Failed to start TrapMap server', error);
    process.exitCode = 1;
  });
}
