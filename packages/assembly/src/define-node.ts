import type { CapabilityNode, ContractDescriptor, NodeTopology } from './types.js';

const TOPOLOGIES: readonly NodeTopology[] = ['embedded', 'standalone', 'cluster'];

/**
 * Declare a capability node, validating its descriptor eagerly (fail-loud).
 *
 * @throws TypeError on empty id, unknown topology, cluster config whose
 *   `replicas` is not an integer >= 1, or embedded topology combined with
 *   a cluster config.
 */
export function defineNode<C>(desc: CapabilityNode<C>): CapabilityNode<C> {
  if (typeof desc.id !== 'string' || desc.id.trim() === '') {
    throw new TypeError('defineNode: node id must be a non-empty string');
  }
  if (desc.topology !== undefined && !TOPOLOGIES.includes(desc.topology)) {
    throw new TypeError(
      `defineNode: unknown topology "${String(desc.topology)}" (expected embedded | standalone | cluster)`,
    );
  }
  if (desc.cluster !== undefined) {
    const replicas = desc.cluster.replicas;
    if (typeof replicas !== 'number' || !Number.isInteger(replicas) || replicas < 1) {
      throw new TypeError(
        `defineNode: cluster.replicas must be an integer >= 1 (got "${String(replicas)}")`,
      );
    }
  }
  if (desc.topology === 'embedded' && desc.cluster !== undefined) {
    throw new TypeError('defineNode: embedded topology cannot carry a cluster config');
  }
  return desc;
}

/**
 * Declare a contract descriptor, validating its id eagerly (fail-loud).
 *
 * @throws TypeError when the contract id is empty.
 */
export function defineContract(descriptor: ContractDescriptor): ContractDescriptor {
  if (typeof descriptor.id !== 'string' || descriptor.id.trim() === '') {
    throw new TypeError('defineContract: contract id must be a non-empty string');
  }
  return descriptor;
}
