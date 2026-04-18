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
 */

import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext } from '../context.js';
import type { KnowledgeRecord } from '../store.js';

/**
 * Check if an entry is eligible for retrieval given auth context and filters.
 * Enforces approval state, team access, security level, and metadata filters.
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
  // Must be approved
  if (entry.lifecycleState !== 'approved') {
    return false;
  }

  // Must have required level <= caller's security level
  if (entry.requiredLevel > auth.securityLevel) {
    return false;
  }

  // Project entries must match active team (unless system admin)
  if (entry.teamId && auth.subjectType !== 'system-admin') {
    if (entry.teamId !== auth.activeTeamId) {
      return false;
    }
  }

  // Apply scope filter if provided
  if (filters.scopes.length > 0 && !filters.scopes.includes(entry.scope)) {
    return false;
  }

  // Apply label filter if provided (all labels must match)
  if (filters.labels.length > 0) {
    const hasAllLabels = filters.labels.every((label) => entry.labels.includes(label));
    if (!hasAllLabels) {
      return false;
    }
  }

  return true;
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
