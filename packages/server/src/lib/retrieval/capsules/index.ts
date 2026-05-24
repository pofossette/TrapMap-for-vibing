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
export {
  createCapsuleKeywordChannel,
  capsuleKeywordChannel,
  capsuleKeywordRecall,
} from './channels/keyword.js';
export type { CapsuleKeywordChannelOptions } from './channels/keyword.js';
export { createCapsuleGraphChannel } from './channels/graph.js';
export {
  buildCapsuleEmbeddingText,
  capsuleSemanticChannel,
  capsuleSemanticRecall,
  createCapsuleSemanticChannel,
  hashCapsuleEmbeddingText,
} from './channels/semantic.js';
export type { CapsuleSemanticChannelOptions } from './channels/semantic.js';
export {
  extractStackPathHints,
  normalizeToken,
  parseSeedIntent,
  parseSeedIntentWithLLM,
} from './intent.js';
export { InMemoryIntentCache } from './intent-cache.js';
export type { IntentCacheStore } from './intent-cache.js';
export { searchSkillsByContent } from './skill-lookup.js';
export { mergeCapsuleCandidates } from './scoring/merge.js';
export { rerankMergedCapsules } from './scoring/rerank.js';
export { buildMultiChannelReason } from './scoring/reasons.js';
export { createCapsuleIndexSync } from './repositories/index-sync.js';
export type { CapsuleIndexSyncConfig, SyncRecord, SyncResult } from './repositories/index-sync.js';
export {
  cleanupOrphanCapsuleIndexes,
  rebuildAllCapsuleIndexes,
  rebuildCapsuleIndexForArtifact,
  verifyCapsuleIndexHealth,
} from './repositories/index-rebuild.js';
export type {
  HealthCheckConfig,
  HealthReport,
  RebuildConfig,
  RebuildStats,
} from './repositories/index-rebuild.js';
