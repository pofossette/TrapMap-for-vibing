/**
 * Shared governance module.
 *
 * Provides unified eligibility and permission checking for both
 * KnowledgeEntry (trap) and SkillArtifact domains.
 *
 * @module governance
 */

// Eligibility functions
export {
  isGovernanceEligible,
  matchesGovernanceFilters,
} from './eligibility.js';

// Permission helpers
export { extractGovernanceContext } from './permissions.js';
