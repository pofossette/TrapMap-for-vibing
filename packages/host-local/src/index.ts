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
 *
 * Boots are wired exclusively through the app shell entry point
 * (`apps/light/src/index.ts`). The library package does NOT boot on direct
 * module execution; consumers must call `start()` explicitly.
 */
export async function start(options: NestBootstrapOptions = {}): Promise<NestBootstrapResult> {
  return bootstrapNest(options);
}

import { bootstrapNest } from './nest/main.js';
