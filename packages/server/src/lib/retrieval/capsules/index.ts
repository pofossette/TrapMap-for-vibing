export {
  CapsuleChannelRegistry,
  createDefaultCapsuleChannelRegistry,
} from './capsule-channel-registry.js';
export {
  CapsuleRecallCoordinator,
  createDefaultCapsuleRecallCoordinator,
} from './capsule-recall-coordinator.js';
export type { CapsuleRecallInput, CapsuleRecallResult } from './capsule-recall-coordinator.js';
export {
  buildProfileShortlist,
  extractGovernedCapsules,
  getCapsuleRecords,
  isArtifactGovernanceEligible,
  rankCapsules,
  computeSituationScore,
  computeProblemScore,
  computeGoalScore,
  computeErrorScore,
  computeKeywordScore,
  computeContextMatchScore,
  computeStackPathBoost,
} from './capsule-recall.js';
export { capsuleHeuristicChannel } from './channels/heuristic.js';
export { capsuleKeywordChannel, capsuleKeywordRecall } from './channels/keyword.js';
export { createCapsuleGraphChannel } from './channels/graph.js';
export {
  buildCapsuleEmbeddingText,
  capsuleSemanticChannel,
  capsuleSemanticRecall,
  hashCapsuleEmbeddingText,
} from './channels/semantic.js';
export { extractStackPathHints, normalizeToken, parseSeedIntent } from './intent.js';
export { searchSkillsByContent } from './skill-lookup.js';
export { mergeCapsuleCandidates } from './scoring/merge.js';
export { rerankMergedCapsules } from './scoring/rerank.js';
export { buildMultiChannelReason } from './scoring/reasons.js';
