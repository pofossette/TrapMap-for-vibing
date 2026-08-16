import { describe, expect, it } from 'vitest';

import {
  defineNode,
  intentRecognitionContract,
  judgmentContracts,
  startupChecks,
} from '@trapmap/assembly';
import type { CapabilityNode } from '@trapmap/assembly';
import { intentRecognitionConfigSchema } from '@trapmap/contracts';
import {
  hostLocalConfigNode,
  hostLocalPgNode,
  hostLocalRuntimeNode,
  hostLocalServicesNode,
} from './host-nodes.js';
import {
  artifactDerivationNode,
  channelMergeNode,
  conflictTriggerNode,
  dedupStrategyNode,
  intentRecognitionNode,
  judgmentNodes,
  labelAlignmentNode,
} from './judgment-nodes.js';

describe('host-local judgment node descriptors (D8)', () => {
  it('exposes the six judgment nodes with expected ids/implements/provides', () => {
    const byId = new Map(judgmentNodes.map((node) => [node.id, node]));
    expect(byId.size).toBe(6);

    expect(intentRecognitionNode.id).toBe('intent-recognition');
    expect(intentRecognitionNode.implements).toBe('intent-recognition');
    expect(intentRecognitionNode.provides).toBe('intentRecognition');

    expect(dedupStrategyNode.id).toBe('dedup-strategy');
    expect(dedupStrategyNode.implements).toBe('dedup-strategy');
    expect(dedupStrategyNode.provides).toBe('dedupStrategy');

    expect(conflictTriggerNode.id).toBe('conflict-trigger');
    expect(conflictTriggerNode.implements).toBe('conflict-trigger');
    expect(conflictTriggerNode.provides).toBe('conflictTrigger');

    expect(artifactDerivationNode.id).toBe('artifact-derivation');
    expect(artifactDerivationNode.implements).toBe('artifact-derivation');
    expect(artifactDerivationNode.provides).toBe('artifactDerivation');

    expect(labelAlignmentNode.id).toBe('label-alignment');
    expect(labelAlignmentNode.implements).toBe('label-alignment');
    expect(labelAlignmentNode.provides).toBe('labelAlignment');

    expect(channelMergeNode.id).toBe('channel-merge');
    expect(channelMergeNode.implements).toBe('channel-merge');
    expect(channelMergeNode.provides).toBe('channelMerge');
  });

  it('every judgment node pins an explicit embedded topology and config schema', () => {
    for (const node of judgmentNodes) {
      expect(node.topology).toBe('embedded');
      expect(node.configSchema).toBeDefined();
    }
  });

  it('has unique ids across all judgment nodes', () => {
    const ids = judgmentNodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('conflict-trigger consumes the host-local runtime (its read/projection deps)', () => {
    expect(conflictTriggerNode.inject).toContain('hostLocalRuntime');
  });

  it('contract registry registers all six D8 contract ids', () => {
    expect(judgmentContracts.map((c) => c.id).sort()).toEqual([
      'artifact-derivation',
      'channel-merge',
      'conflict-trigger',
      'dedup-strategy',
      'intent-recognition',
      'label-alignment',
    ]);
    expect(intentRecognitionContract.id).toBe('intent-recognition');
  });

  it('startup checks pass for the judgment nodes against the contract registry', () => {
    // conflict-trigger injects hostLocalRuntime; include the full host node
    // chain (config → services → pg → runtime) exactly as composePilotProfile does
    const issues = startupChecks(
      [
        ...judgmentNodes,
        hostLocalConfigNode,
        hostLocalServicesNode,
        hostLocalPgNode,
        hostLocalRuntimeNode,
      ],
      judgmentContracts,
    );
    expect(issues).toEqual([]);
  });

  it('startup checks report UNKNOWN_CONTRACT for an unregistered contract id', () => {
    const rogue: CapabilityNode = defineNode({
      id: 'rogue-judgment',
      provides: 'rogueService',
      implements: 'not-a-contract',
      topology: 'embedded',
      configSchema: intentRecognitionConfigSchema,
      apply() {
        /* no-op */
      },
    });
    const issues = startupChecks([rogue], judgmentContracts);
    expect(issues.some((issue) => issue.code === 'UNKNOWN_CONTRACT')).toBe(true);
    expect(issues.some((issue) => issue.nodeId === 'rogue-judgment')).toBe(true);
  });

  it('startup checks report CONTRACT_VIOLATION when a claiming node lacks the agreed provide', () => {
    const broken: CapabilityNode = defineNode({
      id: 'broken-intent',
      provides: 'wrongService',
      implements: 'intent-recognition',
      topology: 'embedded',
      configSchema: intentRecognitionConfigSchema,
      apply() {
        /* no-op */
      },
    });
    const issues = startupChecks([broken], judgmentContracts);
    expect(issues.some((issue) => issue.code === 'CONTRACT_VIOLATION')).toBe(true);
  });

  it('contract descriptors validate the real nodes (verify returns no violations)', () => {
    for (const node of judgmentNodes) {
      const contract = judgmentContracts.find((c) => c.id === node.implements);
      expect(contract).toBeDefined();
      expect(contract!.verify!(node)).toEqual([]);
    }
  });
});
