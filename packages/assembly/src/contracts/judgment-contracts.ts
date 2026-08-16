/**
 * Judgment-node contract registry (design D8, contract-first).
 *
 * One {@link ContractDescriptor} per judgment capability node. The registry
 * lives in the assembly package (the contract-first kernel) so both
 * host-local and host-distributed assemblies register the same descriptors
 * and `startupChecks` validates every node that claims a judgment contract.
 *
 * The descriptors deliberately do NOT reference the contracts package: the
 * assembly kernel stays dependency-minimal (cordis + zod). Structural
 * compatibility is enforced by `verify` (agreed provide service, declared
 * config schema, explicit topology) plus the shared contract fixtures every
 * implementation must pass (backend-core testing/judgment-fixtures).
 */
import { defineContract } from '../define-node.js';
import type { CapabilityNode, ContractDescriptor } from '../types.js';

function providedServiceNames(node: CapabilityNode): string[] {
  if (node.provides === undefined) return [];
  return typeof node.provides === 'string' ? [node.provides] : [...node.provides];
}

/**
 * Verify a node claiming a judgment contract: it must provide the agreed
 * cordis service name, declare a config schema, and pin an explicit
 * topology (embedded default).
 */
function verifyJudgmentNode(serviceName: string) {
  return (node: CapabilityNode): string[] => {
    const violations: string[] = [];
    if (!providedServiceNames(node).includes(serviceName)) {
      violations.push(`node must provide service "${serviceName}"`);
    }
    if (node.configSchema === undefined) {
      violations.push('node must declare a configSchema');
    }
    if (node.topology === undefined) {
      violations.push('node must declare an explicit topology');
    }
    return violations;
  };
}

/** intent-recognition contract descriptor (D8.3). */
export const intentRecognitionContract: ContractDescriptor = defineContract({
  id: 'intent-recognition',
  description: 'Retrieval intent recognition / strategy-mode routing.',
  provides: ['intentRecognition'],
  verify: verifyJudgmentNode('intentRecognition'),
});

/** dedup-strategy contract descriptor (D8.3). */
export const dedupStrategyContract: ContractDescriptor = defineContract({
  id: 'dedup-strategy',
  description: 'Candidate duplicate-detection strategy selection.',
  provides: ['dedupStrategy'],
  verify: verifyJudgmentNode('dedupStrategy'),
});

/** conflict-trigger contract descriptor (D8.3). */
export const conflictTriggerContract: ContractDescriptor = defineContract({
  id: 'conflict-trigger',
  description: 'Governance conflict detection triggering.',
  provides: ['conflictTrigger'],
  verify: verifyJudgmentNode('conflictTrigger'),
});

/** artifact-derivation contract descriptor (D8.3). */
export const artifactDerivationContract: ContractDescriptor = defineContract({
  id: 'artifact-derivation',
  description: 'Skill artifact derivation strategy (profile/capsules/manifest).',
  provides: ['artifactDerivation'],
  verify: verifyJudgmentNode('artifactDerivation'),
});

/** label-alignment contract descriptor (D8.3). */
export const labelAlignmentContract: ContractDescriptor = defineContract({
  id: 'label-alignment',
  description: 'Raw label alignment against the canonical catalog.',
  provides: ['labelAlignment'],
  verify: verifyJudgmentNode('labelAlignment'),
});

/** channel-merge contract descriptor (D8.3). */
export const channelMergeContract: ContractDescriptor = defineContract({
  id: 'channel-merge',
  description: 'Multi-channel recall candidate merge/ranking.',
  provides: ['channelMerge'],
  verify: verifyJudgmentNode('channelMerge'),
});

/** All six judgment-node contract descriptors (design D8 registry). */
export const judgmentContracts: readonly ContractDescriptor[] = [
  intentRecognitionContract,
  dedupStrategyContract,
  conflictTriggerContract,
  artifactDerivationContract,
  labelAlignmentContract,
  channelMergeContract,
];
