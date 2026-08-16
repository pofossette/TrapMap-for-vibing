/**
 * Assembly-zone profiles helpers (Phase 2 pilot).
 *
 * Background: the fallow `assembly` zone only allows backend-core/contracts/lib,
 * so this directory CANNOT import host-local or the `service-*` packages to
 * hard-wire the concrete pilot node list. The concrete `localAgentAssembly` /
 * `teamMonolithAssembly` builders therefore live in host-local
 * (packages/host-local/src/nest/runtime/assembly/profiles/) — the design
 * constraint that "assembly must not depend on services/hosts" is honoured
 * and the placement deviation is intentional (see the Phase 2 report).
 *
 * What belongs here is the *order-preserving composition primitive* that is
 * zone-legal: it takes the already-wired pilot node list and returns an
 * {@link AssemblyBuilder} that adds them in the D3 embedded order with a
 * shared {host, port} config. The host-local profiles use this to guarantee a
 * single, validated composition path regardless of which zone owns the nodes.
 */
import type { AssemblyBuilder } from '../create-assembly.js';
import { createAssembly } from '../create-assembly.js';
import type { CapabilityNode } from '../types.js';

export interface EmbeddedProfileNodeList {
  /** Config/pg/host-services/host-runtime nodes, in boot order. */
  infraNodes: readonly CapabilityNode[];
  /** The seven D2 service node descriptors, in D2 order. */
  serviceNodes: readonly CapabilityNode[];
  /** Transport node (nest-transport or a test fake) added last. */
  transportNode: CapabilityNode;
  /** Optional extra nodes appended after the transport. */
  extraNodes?: readonly CapabilityNode[];
}

export interface EmbeddedProfileOptions {
  host?: string;
  port?: number;
}

/**
 * Compose an embedded pilot assembly from a pre-wired node list.
 *
 * Node ids/provides are validated by `build()` startup checks. The shared
 * transport config ({host, port}) is passed to every node; nodes that ignore
 * their config are unaffected.
 */
export function composeEmbeddedPilot(
  nodes: EmbeddedProfileNodeList,
  options: EmbeddedProfileOptions = {},
): AssemblyBuilder {
  const builder = createAssembly();
  const config: EmbeddedProfileOptions = {
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
  };
  for (const node of nodes.infraNodes) {
    builder.add(node, config);
  }
  for (const node of nodes.serviceNodes) {
    builder.add(node, config);
  }
  builder.add(nodes.transportNode, config);
  for (const node of nodes.extraNodes ?? []) {
    builder.add(node, config);
  }
  return builder;
}
