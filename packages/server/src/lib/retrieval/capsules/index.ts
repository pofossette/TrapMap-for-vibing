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
} from './capsule-recall.js';
export { capsuleHeuristicChannel } from './channels/heuristic.js';
export { extractStackPathHints, normalizeToken, parseSeedIntent } from './intent.js';
export { searchSkillsByContent } from './skill-lookup.js';
