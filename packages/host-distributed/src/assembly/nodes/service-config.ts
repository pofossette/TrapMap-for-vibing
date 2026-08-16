/**
 * Distributed-host config node (Phase 3 assembly convergence).
 *
 * Exposes the authoritative `ServiceConfig` for the service this process
 * boots as. The node is configured with the target `serviceName`; its apply
 * resolves the full config through the shared {@link loadServiceConfig} the
 * legacy starters used, so environment binding is unchanged.
 */
import { defineNode } from '@trapmap/assembly';
import type { CapabilityNode } from '@trapmap/assembly';

import { type ServiceConfig, type ServiceName, loadServiceConfig } from '../../config/index.js';

/** Context service token under which the `ServiceConfig` is provided. */
export const SERVICE_CONFIG_SERVICE = 'serviceConfig';

/** Node config: which distributed service this assembly boots. */
export interface ServiceConfigNodeOptions {
  serviceName: ServiceName;
  /** Optional prebuilt config override (used by tests / callers that already hold config). */
  config?: ServiceConfig;
}

export const serviceConfigNode: CapabilityNode<ServiceConfigNodeOptions> = defineNode({
  id: 'service-config',
  provides: SERVICE_CONFIG_SERVICE,
  topology: 'embedded',
  apply(ctx, options) {
    const config = options.config ?? loadServiceConfig(options.serviceName);
    ctx.provide(SERVICE_CONFIG_SERVICE, config);
  },
});
