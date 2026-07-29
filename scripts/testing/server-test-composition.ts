import {
  resolveDeploymentProfileCompatibility,
  resolveRuntimeDeployment,
} from '../../packages/backend-core/src/index.js';
import type { BuildServerOptions } from '../../packages/server/src/app.js';
import { loadConfig } from '../../packages/host-local/src/nest/config/config.js';
import { buildPostgresComposedServer } from './postgres-server-composition.js';

type TestServerOptions = Pick<
  BuildServerOptions,
  'bodyLimit' | 'config' | 'graphQueryBackend' | 'runtimeMode' | 'serviceUnit' | 'ownerReadModel'
>;

/**
 * Builds the compatibility shell through the dedicated PostgreSQL test
 * composition. The coordinator supplies TRAPMAP_DATABASE_URL.
 */
export async function buildPostgresTestServer(options: TestServerOptions = {}) {
  const baseConfig = loadConfig();
  const { config: configOverrides, ...serverOptions } = options;
  const deploymentProfile = configOverrides?.deployment?.profile ?? baseConfig.deployment.profile;
  const deploymentPreset = configOverrides?.deployment?.preset ?? baseConfig.deployment.preset;
  const deploymentInput = { profile: deploymentProfile, preset: deploymentPreset };
  const config = {
    ...baseConfig,
    ...configOverrides,
    databaseUrl: baseConfig.databaseUrl,
    runtime: { ...baseConfig.runtime, ...configOverrides?.runtime },
    deployment: {
      profile: deploymentProfile,
      preset: deploymentPreset,
      compatibility: resolveDeploymentProfileCompatibility(deploymentInput),
      resolved: resolveRuntimeDeployment(deploymentInput),
    },
  };
  if (!config.databaseUrl) {
    throw new Error('PostgreSQL test composition requires TRAPMAP_DATABASE_URL');
  }
  const composed = buildPostgresComposedServer(config.databaseUrl, {
    ...serverOptions,
    config,
  });
  const app = composed.app;
  app.close = composed.close;
  return app;
}
