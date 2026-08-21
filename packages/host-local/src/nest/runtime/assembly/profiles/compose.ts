/**
 * Shared embedded-pilot profile composition.
 *
 * Both `localAgentAssembly` and `teamMonolithAssembly` build the same host
 * node + service node + transport chain; the only difference is the profile
 * name. This helper keeps that ordering single-sourced.
 */
import { createAssembly } from '@trapmap/assembly';
import type { CapabilityNode } from '@trapmap/assembly';
import type { HostLocalRuntime } from '../../host-runtime.js';

import { judgmentContracts } from '@trapmap/assembly';
import {
  type PilotHostNodeConfig,
  hostLocalConfigNode,
  hostLocalPgNode,
  hostLocalRuntimeNode,
  hostLocalServicesNode,
} from '../nodes/host-nodes.js';
import { judgmentNodes } from '../nodes/judgment-nodes.js';
import { type NestTransportConfig, nestTransportNode } from '../nodes/nest-transport.js';
import { serviceNodes } from '../nodes/service-nodes.js';

export interface PilotProfileOptions {
  host?: string;
  port?: number;
  /** Prebuilt, composed host-local runtime (async-created in the bootstrap). */
  runtime: HostLocalRuntime;
  /** Override the transport node (tests use a fake that binds no real port). Defaults to nest-transport. */
  transportNode?: CapabilityNode;
  /** Extra pilot nodes to append (e.g. a fake transport in tests). */
  extraNodes?: readonly CapabilityNode[];
}

function hostConfig(options: PilotProfileOptions): PilotHostNodeConfig {
  return { runtime: options.runtime };
}

function transportConfig(options: PilotProfileOptions): NestTransportConfig {
  return {
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
  };
}

/** Build the shared embedded pilot AssemblyBuilder for a given profile name. */
export function composePilotProfile(options: PilotProfileOptions) {
  const builder = createAssembly({ contracts: judgmentContracts })
    .add(hostLocalConfigNode, hostConfig(options))
    .add(hostLocalServicesNode, hostConfig(options))
    .add(hostLocalPgNode, hostConfig(options))
    .add(hostLocalRuntimeNode, hostConfig(options));

  for (const node of serviceNodes) {
    builder.add(node);
  }

  for (const node of judgmentNodes) {
    builder.add(node);
  }

  const transport = (options.transportNode ?? nestTransportNode) as CapabilityNode;
  builder.add(transport, transportConfig(options));

  for (const node of options.extraNodes ?? []) {
    builder.add(node);
  }

  return builder;
}
