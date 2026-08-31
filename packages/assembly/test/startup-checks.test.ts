import { describe, expect, it } from 'vitest';

import { startupChecks } from '../src/startup-checks.js';
import type { CapabilityNode, ContractDescriptor, StartupIssue } from '../src/types.js';

const noop = (): void => {};

function node(id: string, overrides: Partial<CapabilityNode> = {}): CapabilityNode {
  return { id, apply: noop, ...overrides };
}

function codes(issues: readonly StartupIssue[]): string[] {
  return issues.map((issue) => issue.code).sort();
}

describe('startupChecks', () => {
  it('returns no issues for a valid composition', () => {
    const nodes = [
      node('a', { provides: ['serviceA'] }),
      node('b', { inject: ['serviceA', 'logger'] }),
    ];
    expect(startupChecks(nodes)).toEqual([]);
  });

  it('reports duplicate node ids', () => {
    const issues = startupChecks([node('a'), node('a')]);
    expect(codes(issues)).toEqual(['DUPLICATE_NODE_ID']);
    expect(issues[0]?.nodeId).toBe('a');
  });

  it('reports inject names that resolve to no node service and no builtin', () => {
    const issues = startupChecks([node('a', { inject: ['nope'] })]);
    expect(codes(issues)).toEqual(['UNKNOWN_INJECT']);
    expect(issues[0]?.nodeId).toBe('a');
  });

  it('accepts cordis builtin services as valid inject names', () => {
    const issues = startupChecks([
      node('a', { inject: ['events', 'logger', 'registry', 'reflect'] }),
    ]);
    expect(issues).toEqual([]);
  });

  it('reports inject cycles (A and B depend on each other)', () => {
    const nodes = [
      node('a', { provides: ['serviceA'], inject: ['serviceB'] }),
      node('b', { provides: ['serviceB'], inject: ['serviceA'] }),
    ];
    const issues = startupChecks(nodes);
    expect(codes(issues)).toEqual(['INJECT_CYCLE', 'INJECT_CYCLE']);
    expect(issues.every((issue) => issue.code === 'INJECT_CYCLE')).toBe(true);
  });

  it('reports duplicate provides across nodes', () => {
    const nodes = [node('a', { provides: ['serviceX'] }), node('b', { provides: ['serviceX'] })];
    const issues = startupChecks(nodes);
    expect(codes(issues)).toEqual(['DUPLICATE_PROVIDE', 'DUPLICATE_PROVIDE']);
  });

  it('reports children referencing an unknown node id', () => {
    const issues = startupChecks([node('a', { children: ['missing'] })]);
    expect(codes(issues)).toEqual(['UNKNOWN_CHILD']);
    expect(issues[0]?.nodeId).toBe('a');
  });

  it('accepts children that reference registered node ids', () => {
    const nodes = [node('parent', { children: ['worker'] }), node('worker')];
    expect(startupChecks(nodes)).toEqual([]);
  });

  it('reports cluster topology without a valid cluster config', () => {
    const missingConfig = node('a', { topology: 'cluster' });
    const invalidReplicas = node('b') as CapabilityNode;
    (invalidReplicas as { topology?: string }).topology = 'cluster';
    (invalidReplicas as { cluster?: { readonly replicas: number } }).cluster = {
      replicas: 0,
    };

    const issues = startupChecks([missingConfig, invalidReplicas]);
    expect(codes(issues)).toEqual(['CLUSTER_MISSING_CONFIG', 'CLUSTER_REPLICAS_INVALID']);
  });

  it('reports embedded topology carrying a cluster config', () => {
    const issues = startupChecks([node('a', { topology: 'embedded', cluster: { replicas: 2 } })]);
    expect(codes(issues)).toEqual(['EMBEDDED_HAS_CLUSTER']);
  });

  it('allows a standalone node with a valid cluster config', () => {
    const issues = startupChecks([node('a', { topology: 'standalone', cluster: { replicas: 2 } })]);
    expect(issues).toEqual([]);
  });

  it('reports a contract id missing from the registry', () => {
    const issues = startupChecks([node('a', { contract: 'missing-contract' })], []);
    expect(codes(issues)).toEqual(['UNKNOWN_CONTRACT']);
    expect(issues[0]?.nodeId).toBe('a');
  });

  it('collects contract.verify violations', () => {
    const contract: ContractDescriptor = {
      id: 'intent',
      verify: (candidate) =>
        candidate.provides?.includes('intentRecognition')
          ? []
          : ['node must provide intentRecognition'],
    };
    const nodes = [
      node('good', { contract: 'intent', provides: ['intentRecognition'] }),
      node('bad', { contract: 'intent' }),
    ];
    const issues = startupChecks(nodes, [contract]);
    expect(codes(issues)).toEqual(['CONTRACT_VIOLATION']);
    expect(issues[0]?.nodeId).toBe('bad');
  });

  it('does not report verify violations for nodes that satisfy the contract', () => {
    const contract: ContractDescriptor = {
      id: 'intent',
      verify: () => [],
    };
    const issues = startupChecks([node('a', { implements: ['intent'] })], [contract]);
    expect(issues).toEqual([]);
  });
});
