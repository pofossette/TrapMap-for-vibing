import { ConsulHttpAdapter } from '@trapmap/backend-core';

/**
 * Backward-compatible alias for the shared Consul HTTP plugin.
 *
 * Design D5 single-plugin convergence: the framework-agnostic
 * {@link ConsulHttpAdapter} lives in @trapmap/backend-core and is the single
 * Consul implementation. This class is retained so existing consumers
 * (gateway discovery-factory, tests) keep a host-local entrypoint that
 * delegates to the shared adapter.
 */
export class ConsulDiscoveryAdapter extends ConsulHttpAdapter {}
