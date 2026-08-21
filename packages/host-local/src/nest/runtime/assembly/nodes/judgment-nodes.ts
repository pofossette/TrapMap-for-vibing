// fallow-ignore-file code-duplication -- the six judgment node descriptors must be declared inside each host zone (fallow forbids host-to-host imports and the assembly zone cannot import service factories); identical contract declarations across hosts are the sanctioned duplication, see host-distributed judgment-nodes
/**
 * Host-local judgment-node descriptors (design D8, D2 mapping).
 *
 * One `defineNode` per judgment capability node: each claims its D8
 * contract id via `implements`, validates node config with the contracts
 * Zod schema, and provides the agreed cordis service name. The rule
 * implementations are the behavior-preserving default (pre-contract logic
 * wrapped); LLM/hybrid implementations can replace them behind the same
 * contract without touching consumers.
 *
 * Placement follows the Phase 2 lesson: these host-local-owned nodes belong
 * in the host package (the assembly zone cannot import service packages).
 */
import { defineNode } from '@trapmap/assembly';
import type { CapabilityNode } from '@trapmap/assembly';
import {
  artifactDerivationConfigSchema,
  channelMergeConfigSchema,
  conflictTriggerConfigSchema,
  dedupStrategyConfigSchema,
  intentRecognitionConfigSchema,
  labelAlignmentConfigSchema,
} from '@trapmap/contracts';
import { createRuleDedupStrategy } from '@trapmap/service-candidate-ingestion';
import {
  createGovernanceConflictReadPort,
  createRuleConflictTrigger,
} from '@trapmap/service-governance-review';
import {
  createRuleChannelMerge,
  createRuleIntentRecognition,
} from '@trapmap/service-knowledge-read';
import {
  createRuleArtifactDerivation,
  createRuleLabelAlignment,
} from '@trapmap/service-knowledge-write';
import type { HostLocalRuntime } from '../../host-runtime.js';

function requireRuntime(ctx: Parameters<CapabilityNode['apply']>[0]): HostLocalRuntime {
  const runtime = ctx.get('hostLocalRuntime') as HostLocalRuntime | undefined;
  if (!runtime) {
    throw new Error('judgment node requires hostLocalRuntime to be provided');
  }
  return runtime;
}

/** intent-recognition: rule (mode passthrough + known-mode validation). */
export const intentRecognitionNode: CapabilityNode = defineNode<unknown>({
  id: 'intent-recognition',
  provides: 'intentRecognition',
  implements: 'intent-recognition',
  inject: [],
  topology: 'embedded',
  configSchema: intentRecognitionConfigSchema,
  apply(ctx) {
    ctx.provide('intentRecognition', createRuleIntentRecognition());
  },
});

/** dedup-strategy: rule (Jaccard/fingerprint detector). */
export const dedupStrategyNode: CapabilityNode = defineNode<unknown>({
  id: 'dedup-strategy',
  provides: 'dedupStrategy',
  implements: 'dedup-strategy',
  inject: [],
  topology: 'embedded',
  configSchema: dedupStrategyConfigSchema,
  apply(ctx) {
    ctx.provide('dedupStrategy', createRuleDedupStrategy());
  },
});

/** conflict-trigger: rule (overlap scoring + optional chat judge). */
export const conflictTriggerNode: CapabilityNode = defineNode<unknown>({
  id: 'conflict-trigger',
  provides: 'conflictTrigger',
  implements: 'conflict-trigger',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  configSchema: conflictTriggerConfigSchema,
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    ctx.provide(
      'conflictTrigger',
      createRuleConflictTrigger({
        read: createGovernanceConflictReadPort(runtime.services.knowledgeOwner),
        projection: runtime.services.governanceReview.conflictProjection,
      }),
    );
  },
});

/** artifact-derivation: rule (deriveFromPayloads pipeline). */
export const artifactDerivationNode: CapabilityNode = defineNode<unknown>({
  id: 'artifact-derivation',
  provides: 'artifactDerivation',
  implements: 'artifact-derivation',
  inject: [],
  topology: 'embedded',
  configSchema: artifactDerivationConfigSchema,
  apply(ctx) {
    ctx.provide('artifactDerivation', createRuleArtifactDerivation());
  },
});

/** label-alignment: rule (exact-match strategy). */
export const labelAlignmentNode: CapabilityNode = defineNode<unknown>({
  id: 'label-alignment',
  provides: 'labelAlignment',
  implements: 'label-alignment',
  inject: [],
  topology: 'embedded',
  configSchema: labelAlignmentConfigSchema,
  apply(ctx) {
    ctx.provide('labelAlignment', createRuleLabelAlignment());
  },
});

/** channel-merge: rule (mergeCandidatesWithGraph). */
export const channelMergeNode: CapabilityNode = defineNode<unknown>({
  id: 'channel-merge',
  provides: 'channelMerge',
  implements: 'channel-merge',
  inject: [],
  topology: 'embedded',
  configSchema: channelMergeConfigSchema,
  apply(ctx) {
    ctx.provide('channelMerge', createRuleChannelMerge<{ id: string }>());
  },
});

/** Ordered list of the six judgment-node descriptors (D8). */
export const judgmentNodes: readonly CapabilityNode[] = [
  intentRecognitionNode,
  dedupStrategyNode,
  conflictTriggerNode,
  artifactDerivationNode,
  labelAlignmentNode,
  channelMergeNode,
];
