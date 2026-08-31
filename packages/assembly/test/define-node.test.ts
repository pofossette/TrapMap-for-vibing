import { describe, expect, it } from 'vitest';

import { defineContract, defineNode } from '../src/define-node.js';
import type { CapabilityNode, ContractDescriptor } from '../src/types.js';

const dummyApply = (): void => {};

function node(overrides: Partial<CapabilityNode> = {}): CapabilityNode {
  return { id: 'node', apply: dummyApply, ...overrides };
}

describe('defineNode', () => {
  it('returns a valid node descriptor unchanged', () => {
    const descriptor = defineNode({
      id: 'retrieval',
      contract: 'retrieval-contract',
      provides: ['knowledgeRead'],
      inject: ['pg'],
      topology: 'embedded',
      apply: dummyApply,
    });
    expect(descriptor.id).toBe('retrieval');
    expect(descriptor.provides).toEqual(['knowledgeRead']);
    expect(descriptor.topology).toBe('embedded');
  });

  it('throws TypeError for an empty id', () => {
    expect(() => defineNode(node({ id: ' ' }))).toThrow(TypeError);
    expect(() => defineNode(node({ id: '' }))).toThrow(TypeError);
  });

  it('throws TypeError for an unknown topology', () => {
    const badTopology = node() as CapabilityNode;
    // runtime-invalid topology bypasses the narrow type on purpose
    (badTopology as { topology?: string }).topology = 'mesh';
    expect(() => defineNode(badTopology)).toThrow(TypeError);
  });

  it('throws TypeError for a cluster config without replicas >= 1', () => {
    const badReplicas = node({ topology: 'standalone' }) as CapabilityNode;
    (badReplicas as { cluster?: { readonly replicas: number } }).cluster = {
      replicas: 0,
    };
    expect(() => defineNode(badReplicas)).toThrow(TypeError);
  });

  it('throws TypeError when embedded topology is combined with a cluster config', () => {
    expect(() => defineNode(node({ topology: 'embedded', cluster: { replicas: 2 } }))).toThrow(
      TypeError,
    );
  });

  it('allows a standalone node with a valid cluster config', () => {
    const descriptor = defineNode(node({ topology: 'standalone', cluster: { replicas: 3 } }));
    expect(descriptor.cluster).toEqual({ replicas: 3 });
  });
});

describe('defineContract', () => {
  it('returns a valid contract descriptor unchanged', () => {
    const descriptor = defineContract({
      id: 'intent',
      description: 'retrieval intent routing',
      verify: () => [],
    });
    expect(descriptor.id).toBe('intent');
  });

  it('throws TypeError for an empty contract id', () => {
    const contract = { id: '  ' } as ContractDescriptor;
    expect(() => defineContract(contract)).toThrow(TypeError);
  });
});
