import {
  createRuntimeSharedInfra,
  type RuntimeInfraShared,
} from '@trapmap/runtime-infra';
import type { JobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';

import type { HostLocalConfig } from '../config/index.js';

export type HostLocalSharedInfra = RuntimeInfraShared;

export type HostLocalStore = HostLocalSharedInfra['store'];
export type HostLocalAsyncTransport = JobRuntimeAsyncTransport;
export type HostLocalAdapterRegistry = HostLocalSharedInfra['adapterRegistry'];
export type HostLocalAiProviders = HostLocalSharedInfra['ai'];
export type HostLocalRepos = HostLocalSharedInfra['repos'];
export type HostLocalGraphQueryBackend = HostLocalSharedInfra['graphQueryBackend'];
export type HostLocalGraphQueryRuntimeState = HostLocalSharedInfra['graphQuery'];

export async function createHostLocalSharedInfra(
  config: HostLocalConfig,
): Promise<HostLocalSharedInfra> {
  // Shared seam only: host-local delegates adapter construction to runtime-infra,
  // which currently uses buildDefaultAdapterRegistry().
  return createRuntimeSharedInfra(config);
}
