/**
 * @trapmap/host-local
 *
 * Default Nest-based light host entry for TrapMap.
 *
 * This is the default and only supported `light` host entry.
 *
 * Usage:
 *   import { start } from '@trapmap/host-local';
 *   const handle = await start();
 *   // handle.close() to shut down
 */

export interface NestBootstrapOptions {
  host?: string;
  port?: number;
  /** Selects the assembly pilot profile (defaults to TRAPMAP_DEPLOYMENT_PROFILE / local-agent). */
  profile?: 'local-agent' | 'team-monolith';
}

export interface NestBootstrapResult {
  app: unknown;
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the default Nest light host.
 */
export async function start(options: NestBootstrapOptions = {}): Promise<NestBootstrapResult> {
  return bootstrapNest(options);
}

// ---------------------------------------------------------------------------
// Direct execution (CLI entry)
// ---------------------------------------------------------------------------

/**
 * When run directly via `tsx src/index.ts` or `node dist/index.ts`,
 * start the Nest light host with default configuration.
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
import { bootstrapNest } from './nest/main.js';
