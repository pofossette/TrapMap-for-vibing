/**
 * Retrieval filtering module.
 *
 * Handles eligibility filtering for knowledge entries including:
 * - Approval state (lifecycleState === 'approved')
 * - Security level (requiredLevel <= caller's level)
 * - Team access (project entries match active team, unless system admin)
 * - Scope filters (global/project)
 * - Label filters (all labels must match)
 *
 * This module is called by the orchestrator BEFORE recall candidate generation,
 * ensuring security and eligibility gates are enforced before any semantic search.
 *
 * Delegates to the shared governance module for unified eligibility logic.
 */

import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext } from '../context.js';
import {
  extractGovernanceContext,
  isGovernanceEligible,
  matchesGovernanceFilters,
} from '../governance/index.js';
import type { KnowledgeRecord } from '../store.js';

/**
 * Adapt a KnowledgeRecord to the GovernedEntity interface.
 * KnowledgeRecord has: lifecycleState, requiredLevel, teamId, scope, labels.
 */
function toGovernedEntity(entry: KnowledgeRecord) {
  return {
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    labels: entry.labels,
  };
}

/**
 * Check if an entry is eligible for retrieval given auth context and filters.
 * Enforces approval state, team access, security level, and metadata filters.
 * Delegates to shared governance module for unified eligibility logic.
 *
 * @param entry - Knowledge entry to check
 * @param auth - Resolved auth context of the caller
 * @param filters - Query filters (scopes, labels)
 * @returns true if entry is eligible for retrieval
 */
export function isEntryEligible(
  entry: KnowledgeRecord,
  auth: ResolvedAuthContext,
  filters: RetrievalQuery['filters'],
): boolean {
  const context = extractGovernanceContext(auth);
  const entity = toGovernedEntity(entry);
  const governanceFilters = {
    scopes: filters.scopes,
    labels: filters.labels,
  };

  return isGovernanceEligible(entity, context) && matchesGovernanceFilters(entity, governanceFilters);
}

/**
 * Filter knowledge entries by eligibility criteria.
 *
 * @param entries - All knowledge entries to filter
 * @param auth - Resolved auth context of the caller
 * @param filters - Query filters (scopes, labels)
 * @returns Eligible entries that passed all filters
 */
export function filterEligibleEntries(
  entries: KnowledgeRecord[],
  auth: ResolvedAuthContext,
  filters: RetrievalQuery['filters'],
): KnowledgeRecord[] {
  return entries.filter((entry) => isEntryEligible(entry, auth, filters));
}
