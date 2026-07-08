/**
 * Retrieval filtering module.
 *
 * Handles eligibility filtering for knowledge entries including:
 * - Approval state (lifecycleState === 'approved')
 * - Security level (requiredLevel <= caller's level)
 * - Team access (project entries match active team, unless system admin)
 * - Scope filters (global/project)
 * - Label filters (all labels must match)
 * - Decay state (hard decay: exclude expired/superseded)
 *
 * This module is called by the orchestrator BEFORE recall candidate generation,
 * ensuring security and eligibility gates are enforced before any semantic search.
 *
 * Delegates to the shared governance module for unified eligibility logic.
 */

import type { BoundaryContext, RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { isSuppressedByFeedback } from './feedback-remediation.js';
import { getKnowledgeReadSupportInfra } from './knowledge-read-support-infra.js';
import { getRetrievalInfra } from './retrieval-infra.js';
import type { KnowledgeRecord } from './store.js';

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
  services?: Pick<SkillShareerServices, 'knowledgeReadSupportInfra'>,
): boolean {
  if (isSuppressedByFeedback(entry)) {
    return false;
  }

  return getKnowledgeReadSupportInfra(services).governance.isEntryEligible(entry, auth, filters);
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
  services?: Pick<SkillShareerServices, 'knowledgeReadSupportInfra'>,
): KnowledgeRecord[] {
  return entries.filter((entry) => isEntryEligible(entry, auth, filters, services));
}

/**
 * Filter knowledge entries by boundary constraints.
 * Entries whose required version constraints are not satisfied by the
 * query boundary context are excluded from results.
 *
 * @param entries - Eligible knowledge entries
 * @param boundaryContext - Optional boundary context from the query
 * @returns Entries that satisfy required boundary constraints
 */
export function filterByBoundaryContext(
  entries: KnowledgeRecord[],
  boundaryContext: BoundaryContext | undefined,
  services?: Pick<SkillShareerServices, 'retrievalInfra'>,
): KnowledgeRecord[] {
  if (!boundaryContext) {
    return entries;
  }
  return getRetrievalInfra(services).scoring.filterByBoundary(entries, boundaryContext);
}
