/**
 * Bridges the authoritative ServerConfig from packages/server/src/config.ts
 * into the Nest ConfigModule.
 *
 * Phase 1 rule: packages/server/src/config.ts remains the single env schema
 * source of truth. This bridge only composes — it never re-declares schema.
 *
 * TODO(Phase 4 cutover): extract config loading into host-local owned config
 * module; current dependency on @trapmap/server/config.js is a
 * migration-window coupling.
 */

import { loadConfig, type ServerConfig } from '@trapmap/server/config.js';

export interface NestConfigBridge {
  serverConfig: ServerConfig;
}

/**
 * Factory for Nest ConfigModule's `load` option.
 * Calls loadConfig() once and exposes the full ServerConfig under a single key.
 */
export function loadServerConfigBridge(): NestConfigBridge {
  return {
    serverConfig: loadConfig(),
  };
}

/**
 * Token used to inject the bridged ServerConfig throughout the Nest host.
 */
export const SERVER_CONFIG_TOKEN = 'SERVER_CONFIG';
