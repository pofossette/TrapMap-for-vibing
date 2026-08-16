/**
 * Distributed-host PostgreSQL node (Phase 3 assembly convergence).
 *
 * Replaces the per-starter `createServiceDatabase(config)` boilerplate: the
 * node consumes the provided `ServiceConfig` and exposes a single
 * `ServiceDatabase` on the context. Lifecycle remains owned by the caller
 * via the returned handle (as the legacy starters did), so the node registers
 * no disposer — runtime shutdown still flows through `db.close()` on the
 * DistributedServiceHandle.
 */
import { defineNode } from '@trapmap/assembly';
import type { CapabilityNode } from '@trapmap/assembly';

import { createServiceDatabase } from '../../shared/database.js';
import { SERVICE_CONFIG_SERVICE } from './service-config.js';

/** Context service token under which the `ServiceDatabase` is provided. */
export const SERVICE_DATABASE_SERVICE = 'serviceDatabase';

export const serviceDatabaseNode: CapabilityNode = defineNode({
  id: 'service-database',
  provides: SERVICE_DATABASE_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE],
  topology: 'embedded',
  apply(ctx) {
    const config = ctx.get(SERVICE_CONFIG_SERVICE);
    ctx.provide(SERVICE_DATABASE_SERVICE, createServiceDatabase(config));
  },
});
