import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineNode } from '../../src/define-node.js';
import type { CapabilityNode } from '../../src/types.js';
import {
  artifactDerivationContract,
  channelMergeContract,
  conflictTriggerContract,
  dedupStrategyContract,
  intentRecognitionContract,
  judgmentContracts,
  labelAlignmentContract,
} from '../../src/contracts/judgment-contracts.js';

const testConfigSchema = z.object({ mode: z.enum(['rule', 'llm', 'hybrid']).default('rule') });

function compliantNode(overrides: Partial<CapabilityNode> = {}): CapabilityNode {
  return defineNode({
    id: 'test-node',
    provides: 'intentRecognition',
    implements: 'intent-recognition',
    topology: 'embedded',
    configSchema: testConfigSchema,
    apply() {
      /* no-op */
    },
    ...overrides,
  });
}

describe('assembly judgment contract registry (D8)', () => {
  it('registers all six D8 contract ids', () => {
    expect(judgmentContracts.map((c) => c.id).sort()).toEqual([
      'artifact-derivation',
      'channel-merge',
      'conflict-trigger',
      'dedup-strategy',
      'intent-recognition',
      'label-alignment',
    ]);
    expect(artifactDerivationContract.id).toBe('artifact-derivation');
    expect(channelMergeContract.id).toBe('channel-merge');
    expect(conflictTriggerContract.id).toBe('conflict-trigger');
    expect(dedupStrategyContract.id).toBe('dedup-strategy');
    expect(intentRecognitionContract.id).toBe('intent-recognition');
    expect(labelAlignmentContract.id).toBe('label-alignment');
  });

  it('verify passes for a compliant node', () => {
    expect(intentRecognitionContract.verify?.(compliantNode())).toEqual([]);
  });

  it('verify rejects a node that does not provide the agreed service', () => {
    const violations = intentRecognitionContract.verify?.(
      compliantNode({ provides: 'wrongService' }),
    );
    expect(violations?.join(' ')).toContain('intentRecognition');
  });

  it('verify rejects a node without a config schema', () => {
    const violations = intentRecognitionContract.verify?.(
      compliantNode({ configSchema: undefined }),
    );
    expect(violations?.join(' ')).toContain('configSchema');
  });

  it('verify rejects a node without an explicit topology', () => {
    const violations = intentRecognitionContract.verify?.(compliantNode({ topology: undefined }));
    expect(violations?.join(' ')).toContain('topology');
  });

  it('every contract descriptor declares a provides list', () => {
    for (const contract of judgmentContracts) {
      expect(contract.provides?.length).toBeGreaterThan(0);
      expect(contract.verify).toBeTypeOf('function');
    }
  });
});
