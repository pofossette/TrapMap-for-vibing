/**
 * Shared governance module.
 *
 * Provides unified eligibility and permission checking for both
 * KnowledgeEntry (trap) and SkillArtifact domains.
 *
 * @module governance
 */

// Types
export type { GovernanceContext, GovernedEntity, GovernanceFilters } from './types.js';

// Eligibility functions
export {
  isGovernanceEligible,
  matchesGovernanceFilters,
  isGovernedEntityAccessible,
  filterGovernedEntities,
} from './eligibility.js';

// Permission helpers
export {
  extractGovernanceContext,
  hasPermission,
  requirePermission,
  requireTeamAccess,
  requireHigherLevel,
} from './permissions.js';
