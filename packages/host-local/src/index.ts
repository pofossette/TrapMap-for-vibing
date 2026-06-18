/**
 * @trapmap/host-local
 *
 * Light-weight local host assembly for TrapMap.
 *
 * This is the main entry point. The `start()` function boots the HTTP server
 * using configuration from environment variables or the provided options.
 *
 * Usage:
 *   import { start } from '@trapmap/host-local';
 *   const handle = await start();
 *   // handle.close() to shut down
 */

import { type BootstrapOptions, type BootstrapResult, bootstrap } from './bootstrap/index.js';
import { loadHostConfig } from './config/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type { BootstrapOptions, BootstrapResult } from './bootstrap/index.js';
export type { HostConfig } from './config/index.js';

/**
 * Start the light host server.
 *
 * Loads configuration from environment variables if not overridden
 * by the provided options.
 */
export async function start(overrides: Partial<BootstrapOptions> = {}): Promise<BootstrapResult> {
  const config = loadHostConfig();

  const options: BootstrapOptions = {
    deploymentProfile: overrides.deploymentProfile ?? config.deploymentProfile,
    deploymentPreset: overrides.deploymentPreset ?? config.deploymentPreset,
    runtimeMode: overrides.runtimeMode ?? config.runtimeMode,
    port: overrides.port ?? config.port,
    host: overrides.host ?? config.host,
    logLevel: overrides.logLevel ?? config.logLevel,
    ...overrides,
  };

  return bootstrap(options);
}

// ---------------------------------------------------------------------------
// Direct execution (CLI entry)
// ---------------------------------------------------------------------------

/**
 * When run directly via `tsx src/index.ts` or `node dist/index.ts`,
 * start the server with default configuration.
 */
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/host-local/src/index.ts') ||
    process.argv[1].endsWith('\\host-local\\src\\index.ts') ||
    process.argv[1].endsWith('/host-local/dist/index.js') ||
    process.argv[1].endsWith('\\host-local\\dist\\index.js'));

if (isDirectExecution) {
  start()
    .then((handle) => {
      // Graceful shutdown
      const shutdown = async () => {
        console.log('Shutting down...');
        await handle.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error('Failed to start host-local:', error);
      process.exit(1);
    });
}
