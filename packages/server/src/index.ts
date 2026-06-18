import { pathToFileURL } from 'node:url';

import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { resolveRuntimeDeployment } from './lib/runtime/deployment-profile.js';

async function start() {
  const config = loadConfig();
  const runtimeDeployment = resolveRuntimeDeployment({
    preset: config.deployment.preset,
    ...(config.deployment.profile ? { profile: config.deployment.profile } : {}),
  });
  const runtimeMode = runtimeDeployment.runtimeMode;
  const serviceUnit = runtimeDeployment.serviceUnit;
  const server = buildServer({ runtimeMode, serviceUnit });
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '127.0.0.1';

  await server.listen({ host, port });
  server.log.info(
    {
      host,
      port,
      deploymentProfile: runtimeDeployment.deploymentProfile,
      runtimeMode,
      serviceUnit,
    },
    'TrapMap server started',
  );
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  start().catch((error: unknown) => {
    console.error('Failed to start TrapMap server', error);
    process.exitCode = 1;
  });
}
