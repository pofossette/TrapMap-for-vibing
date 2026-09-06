/**
 * Host-local assembly pilot nodes: config / pg / host-services / host-runtime.
 *
 * These are host-local-owned infrastructure nodes (fallow zone `host-local`),
 * not service-package nodes, so keeping them here honours the architecture
 * boundary: `assembly` and the `service-*` zones must not depend on hosts.
 *
 * Phase 2 pilot deviation (documented): cordis 4.x does not dependably wake
 * an injecting fiber when a *providing* node's `apply` is async and calls
 * `ctx.provide` only after an `await` (the provider stays in LOADING and its
 * dependents stay PENDING). To keep the pilot boot deterministic, the async
 * `createHostLocalRuntime()` (which internally calls `createHostLocalServices`)
 * runs in the Nest bootstrap (outside cordis), and the prebuilt runtime is
 * handed to these nodes through the assembly config. Each node therefore
 * wraps the prebuilt runtime/services synchronously, preserving the exact
 * same composed services and ordering without depending on async provide.
 */
import type { CapabilityNode } from '@trapmap/assembly';
import { defineNode } from '@trapmap/assembly';
import type { HostLocalConfig } from '../../../config/index.js';
import type { HostLocalRuntime } from '../../host-runtime.js';
import type { HostLocalServices } from '../../host-services.js';

/** Shared config the pilot host nodes receive. */
export interface PilotHostNodeConfig {
  /** Prebuilt, composed host-local runtime (owned by the bootstrap). */
  runtime: HostLocalRuntime;
}

function requireConfig(config: PilotHostNodeConfig): HostLocalRuntime {
  if (!config?.runtime) {
    throw new Error('host node requires a prebuilt HostLocalRuntime in config.runtime');
  }
  return config.runtime;
}

/** Node that exposes the authoritative host-local config from the runtime. */
export const hostLocalConfigNode: CapabilityNode<PilotHostNodeConfig> = defineNode({
  id: 'host-local-config',
  provides: 'hostLocalConfig',
  topology: 'embedded',
  apply(ctx, config) {
    const runtime = requireConfig(config);
    ctx.provide('hostLocalConfig', runtime.services.config as HostLocalConfig);
  },
});

/**
 * Node that exposes the composed services bundle (owner of the shared store
 * pool). Disposing the node closes the shared store.
 */
export const hostLocalServicesNode: CapabilityNode<PilotHostNodeConfig> = defineNode({
  id: 'host-local-services',
  provides: 'hostLocalServices',
  inject: ['hostLocalConfig'],
  topology: 'embedded',
  apply(ctx, config) {
    const runtime = requireConfig(config);
    const services: HostLocalServices = runtime.services;
    ctx.provide('hostLocalServices', services);
    return () => services.close();
  },
});

/**
 * Node that exposes the shared PostgreSQL pool from the single services store.
 */
export const hostLocalPgNode: CapabilityNode<PilotHostNodeConfig> = defineNode({
  id: 'host-local-pg',
  provides: 'pg',
  inject: ['hostLocalServices'],
  topology: 'embedded',
  apply(ctx, config) {
    const runtime = requireConfig(config);
    const store = runtime.services.store;
    const pool = typeof store.getPool === 'function' ? store.getPool() : null;
    if (!pool) {
      throw new Error('host-local-pg node requires a PostgreSQL pool on the store');
    }
    ctx.provide('pg', pool);
  },
});

/** Node that exposes the prebuilt composed runtime to pilot service nodes. */
export const hostLocalRuntimeNode: CapabilityNode<PilotHostNodeConfig> = defineNode({
  id: 'host-local-runtime',
  provides: 'hostLocalRuntime',
  inject: ['hostLocalServices'],
  topology: 'embedded',
  apply(ctx, config) {
    const runtime = requireConfig(config);
    ctx.provide('hostLocalRuntime', runtime);
  },
});
