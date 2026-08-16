// fallow-ignore-file code-duplication -- the six judgment node descriptors must be declared inside each host zone (fallow forbids host-to-host imports and the assembly zone cannot import service factories); identical contract declarations across hosts are the sanctioned duplication, same as the service-nodes precedent
/**
 * Host-distributed judgment-node descriptors (design D8).
 *
 * One `defineNode` per judgment capability node, mounted inside the
 * distributed service process that owns the capability:
 * - knowledge-read → intent-recognition + channel-merge
 * - candidate-ingestion → dedup-strategy
 * - governance-review → conflict-trigger (read via internal clients,
 *   projection via the pg owner bundle)
 * - knowledge-write → artifact-derivation + label-alignment
 *
 * The rule implementations are the behavior-preserving default; the
 * contracts registry (host-local `judgment-contracts`) validates the
 * descriptors at build time via `startupChecks`.
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
  createGovernanceReviewPgOwnerBundle,
  createRuleConflictTrigger,
} from '@trapmap/service-governance-review';
import {
  createRuleArtifactDerivation,
  createRuleLabelAlignment,
} from '@trapmap/service-knowledge-write';
import {
  createRuleChannelMerge,
  createRuleIntentRecognition,
} from '@trapmap/service-knowledge-read';

import type { ServiceConfig } from '../../config/index.js';
import { createInternalServiceClients } from '../../gateway/internal-client.js';
import { createDistributedGovernanceConflictReadPort } from '../../governance-review/conflict-read.js';
import { SERVICE_CONFIG_SERVICE } from './service-config.js';
import { SERVICE_DATABASE_SERVICE } from './service-database.js';

function requireConfig(ctx: Parameters<CapabilityNode['apply']>[0]): ServiceConfig {
  const config = ctx.get(SERVICE_CONFIG_SERVICE);
  return config;
}

function requireDatabase(): never {
  throw new Error('judgment node requires serviceDatabase to be provided');
}

/** intent-recognition: rule (mode passthrough + known-mode validation). */
const intentRecognitionNode: CapabilityNode = defineNode<unknown>({
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

/** channel-merge: rule (mergeCandidatesWithGraph). */
const channelMergeNode: CapabilityNode = defineNode<unknown>({
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

/** dedup-strategy: rule (Jaccard/fingerprint detector). */
const dedupStrategyNode: CapabilityNode = defineNode<unknown>({
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

/** conflict-trigger: rule with distributed read (internal clients) + pg projection. */
const conflictTriggerNode: CapabilityNode = defineNode<unknown>({
  id: 'conflict-trigger',
  provides: 'conflictTrigger',
  implements: 'conflict-trigger',
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  configSchema: conflictTriggerConfigSchema,
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    const owner = createGovernanceReviewPgOwnerBundle(db.pool);
    const internalClients = createInternalServiceClients(config.internalUrls);
    ctx.provide(
      'conflictTrigger',
      createRuleConflictTrigger({
        read: createDistributedGovernanceConflictReadPort(internalClients),
        projection: owner.conflictProjection,
      }),
    );
  },
});

/** artifact-derivation: rule (deriveFromPayloads pipeline). */
const artifactDerivationNode: CapabilityNode = defineNode<unknown>({
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
const labelAlignmentNode: CapabilityNode = defineNode<unknown>({
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

/** Judgment nodes mounted in the knowledge-read service process. */
export const knowledgeReadJudgmentNodes: readonly CapabilityNode[] = [
  intentRecognitionNode,
  channelMergeNode,
];

/** Judgment nodes mounted in the candidate-ingestion service process. */
export const candidateIngestionJudgmentNodes: readonly CapabilityNode[] = [dedupStrategyNode];

/** Judgment nodes mounted in the governance-review service process. */
export const governanceReviewJudgmentNodes: readonly CapabilityNode[] = [conflictTriggerNode];

/** Judgment nodes mounted in the knowledge-write service process. */
export const knowledgeWriteJudgmentNodes: readonly CapabilityNode[] = [
  artifactDerivationNode,
  labelAlignmentNode,
];
