import type { CapabilityNode, ContractDescriptor, StartupIssue } from './types.js';

/** Cordis built-in services that are always available on every context. */
const CORDIS_BUILTINS: ReadonlySet<string> = new Set(['events', 'logger', 'registry', 'reflect']);

function toArray(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : value;
}

function checkDuplicateIds(nodes: readonly CapabilityNode[]): StartupIssue[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) duplicated.add(node.id);
    seen.add(node.id);
  }
  return [...duplicated].map((id) => ({
    code: 'DUPLICATE_NODE_ID',
    nodeId: id,
    message: `Duplicate node id "${id}"`,
  }));
}

function checkUnknownInject(
  nodes: readonly CapabilityNode[],
  providesToNodes: ReadonlyMap<string, readonly CapabilityNode[]>,
): StartupIssue[] {
  const issues: StartupIssue[] = [];
  for (const node of nodes) {
    for (const name of toArray(node.inject)) {
      if (!providesToNodes.has(name) && !CORDIS_BUILTINS.has(name)) {
        issues.push({
          code: 'UNKNOWN_INJECT',
          nodeId: node.id,
          message: `Node "${node.id}" injects service "${name}" that is neither provided by another node nor a cordis built-in`,
        });
      }
    }
  }
  return issues;
}

function checkInjectCycles(
  nodes: readonly CapabilityNode[],
  providesToNodes: ReadonlyMap<string, readonly CapabilityNode[]>,
): StartupIssue[] {
  const providerIdsOf = new Map<string, string[]>();
  for (const node of nodes) {
    const deps = new Set<string>();
    for (const name of toArray(node.inject)) {
      for (const provider of providesToNodes.get(name) ?? []) {
        deps.add(provider.id);
      }
    }
    providerIdsOf.set(node.id, [...deps]);
  }

  const color = new Map<string, 0 | 1 | 2>();
  const path: string[] = [];
  const issues: StartupIssue[] = [];

  const reportCycle = (cycleStart: number): void => {
    const cycle = [...path.slice(cycleStart), path[cycleStart]!];
    for (const member of new Set(cycle)) {
      color.set(member, 2);
      issues.push({
        code: 'INJECT_CYCLE',
        nodeId: member,
        message: `Inject cycle detected: ${cycle.join(' -> ')}`,
      });
    }
  };

  const visit = (id: string): void => {
    const state = color.get(id) ?? 0;
    if (state === 2) return;
    if (state === 1) {
      reportCycle(path.indexOf(id));
      return;
    }
    color.set(id, 1);
    path.push(id);
    for (const dep of providerIdsOf.get(id) ?? []) {
      visit(dep);
    }
    path.pop();
    if ((color.get(id) ?? 0) !== 2) {
      color.set(id, 2);
    }
  };

  for (const node of nodes) {
    visit(node.id);
  }
  return issues;
}

function checkDuplicateProvides(
  providesToNodes: ReadonlyMap<string, readonly CapabilityNode[]>,
): StartupIssue[] {
  const issues: StartupIssue[] = [];
  for (const [name, providers] of providesToNodes) {
    if (providers.length < 2) continue;
    for (const node of providers) {
      issues.push({
        code: 'DUPLICATE_PROVIDE',
        nodeId: node.id,
        message: `Service "${name}" is provided by ${providers.length} nodes (including "${node.id}")`,
      });
    }
  }
  return issues;
}

function checkClusterReplicas(nodes: readonly CapabilityNode[]): StartupIssue[] {
  const issues: StartupIssue[] = [];
  for (const node of nodes) {
    if (node.cluster === undefined) continue;
    const replicas = node.cluster.replicas;
    if (typeof replicas === 'number' && Number.isInteger(replicas) && replicas >= 1) {
      continue;
    }
    issues.push({
      code: 'CLUSTER_REPLICAS_INVALID',
      nodeId: node.id,
      message: `Node "${node.id}" declares cluster config but replicas must be an integer >= 1 (got "${String(replicas)}")`,
    });
  }
  return issues;
}

function checkClusterMissingConfig(nodes: readonly CapabilityNode[]): StartupIssue[] {
  const issues: StartupIssue[] = [];
  for (const node of nodes) {
    if (node.topology !== 'cluster' || node.cluster !== undefined) continue;
    issues.push({
      code: 'CLUSTER_MISSING_CONFIG',
      nodeId: node.id,
      message: `Node "${node.id}" has topology "cluster" but no cluster config`,
    });
  }
  return issues;
}

function checkEmbeddedHasCluster(nodes: readonly CapabilityNode[]): StartupIssue[] {
  const issues: StartupIssue[] = [];
  for (const node of nodes) {
    if (node.topology !== 'embedded' || node.cluster === undefined) continue;
    issues.push({
      code: 'EMBEDDED_HAS_CLUSTER',
      nodeId: node.id,
      message: `Node "${node.id}" has embedded topology but carries a cluster config`,
    });
  }
  return issues;
}

function checkChildren(
  nodes: readonly CapabilityNode[],
  nodeById: ReadonlyMap<string, CapabilityNode>,
): StartupIssue[] {
  const issues: StartupIssue[] = [];
  for (const node of nodes) {
    for (const childId of toArray(node.children)) {
      if (!nodeById.has(childId)) {
        issues.push({
          code: 'UNKNOWN_CHILD',
          nodeId: node.id,
          message: `Node "${node.id}" references unknown child node "${childId}"`,
        });
      }
    }
  }
  return issues;
}

function collectClaimedContractIds(node: CapabilityNode): string[] {
  const claimed = new Set<string>();
  if (node.contract !== undefined) claimed.add(node.contract);
  for (const id of toArray(node.implements)) claimed.add(id);
  return [...claimed];
}

function checkContractFor(
  id: string,
  node: CapabilityNode,
  contractById: ReadonlyMap<string, ContractDescriptor>,
): StartupIssue[] {
  const contract = contractById.get(id);
  if (contract === undefined) {
    return [
      {
        code: 'UNKNOWN_CONTRACT',
        nodeId: node.id,
        message: `Node "${node.id}" references contract "${id}" that is not in the contracts registry`,
      },
    ];
  }
  if (contract.verify === undefined) return [];
  return contract.verify(node).map((violation) => ({
    code: 'CONTRACT_VIOLATION',
    nodeId: node.id,
    message: `Contract "${id}" violation for node "${node.id}": ${violation}`,
  }));
}

function checkContracts(
  nodes: readonly CapabilityNode[],
  contracts: readonly ContractDescriptor[],
): StartupIssue[] {
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const issues: StartupIssue[] = [];
  for (const node of nodes) {
    for (const id of collectClaimedContractIds(node)) {
      issues.push(...checkContractFor(id, node, contractById));
    }
  }
  return issues;
}

/**
 * Pure startup validation over an assembly's nodes and contract registry.
 * Never throws; returns every finding as a {@link StartupIssue}.
 */
export function startupChecks(
  nodes: readonly CapabilityNode[],
  contracts: readonly ContractDescriptor[] = [],
): StartupIssue[] {
  const nodeById = new Map<string, CapabilityNode>();
  const providesToNodes = new Map<string, CapabilityNode[]>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    for (const name of toArray(node.provides)) {
      const list = providesToNodes.get(name) ?? [];
      list.push(node);
      providesToNodes.set(name, list);
    }
  }

  return [
    ...checkDuplicateIds(nodes),
    ...checkUnknownInject(nodes, providesToNodes),
    ...checkInjectCycles(nodes, providesToNodes),
    ...checkDuplicateProvides(providesToNodes),
    ...checkClusterReplicas(nodes),
    ...checkClusterMissingConfig(nodes),
    ...checkEmbeddedHasCluster(nodes),
    ...checkChildren(nodes, nodeById),
    ...checkContracts(nodes, contracts),
  ];
}
