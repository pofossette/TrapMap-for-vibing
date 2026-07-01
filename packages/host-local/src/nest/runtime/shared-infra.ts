import {
  createRuntimeSharedInfra,
  type RuntimeInfraShared,
} from '@trapmap/runtime-infra';

import type { HostLocalConfig } from "@trapmap/host-local/nest/config/index.js";

export type HostLocalSharedInfra = RuntimeInfraShared;

export type HostLocalStore = HostLocalSharedInfra['store'];
export type HostLocalAsyncTransport = HostLocalSharedInfra['asyncTransport'];
export type HostLocalAdapterRegistry = HostLocalSharedInfra['adapterRegistry'];
export type HostLocalAiProviders = HostLocalSharedInfra['ai'];
export type HostLocalRepos = HostLocalSharedInfra['repos'];
export type HostLocalGraphQueryBackend = HostLocalSharedInfra['graphQueryBackend'];
export type HostLocalGraphQueryRuntimeState = HostLocalSharedInfra['graphQuery'];
export type HostLocalEventBus = HostLocalSharedInfra['eventBus'];

export async function createHostLocalSharedInfra(
  config: HostLocalConfig,
): Promise<HostLocalSharedInfra> {
  // Shared seam only: host-local delegates adapter construction to runtime-infra,
  // which currently uses buildDefaultAdapterRegistry().
  return createRuntimeSharedInfra(config);
}
