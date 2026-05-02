/**
 * Shared governance types for unified eligibility checking.
 * Used by both KnowledgeEntry (trap) and SkillArtifact domains.
 */

import type { DecayState, LifecycleState, Scope, SecurityLevel } from '@trapmap/contracts';

/**
 * Governance context representing the caller's access rights.
 * Extracted from ResolvedAuthContext for governance decisions.
 */
export interface GovernanceContext {
  /** Active team ID (null for global-only access) */
  teamId: string | null;
  /** Caller's security level (0-10) */
  securityLevel: SecurityLevel;
  /** Whether caller is system admin with full access */
  isSystemAdmin: boolean;
}

/**
 * Common governance properties shared by KnowledgeEntry and SkillArtifact.
 * Both domains must implement these for unified eligibility checking.
 */
export interface GovernedEntity {
  /** Team ID for project-scoped entities, null for global */
  teamId: string | null;
  /** Entity scope: global or project */
  scope: Scope;
  /** Minimum security level required to access */
  requiredLevel: SecurityLevel;
  /** Current lifecycle state (only 'approved' is eligible for retrieval) */
  lifecycleState: LifecycleState;
  /** Computed decay state (only meaningful when lifecycleState is 'approved') */
  decayState?: DecayState;
}

/**
 * Optional filters for governance eligibility.
 * Used for scope and label filtering during retrieval.
 */
export interface GovernanceFilters {
  /** Filter by scope (empty = all scopes) */
  scopes: Scope[];
  /** Filter by labels (all must match) */
  labels: string[];
}

/**
 * Options for governance eligibility checks.
 */
export interface EligibilityOptions {
  /** When true (default), exclude expired and superseded entries. Set false for admin views. */
  excludeDecayed?: boolean;
}
