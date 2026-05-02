/**
 * Shared governance eligibility functions.
 * Unifies logic from retrieval/filters.ts and retrieval/capsule-recall.ts.
 */

import type { EligibilityOptions, GovernanceContext, GovernanceFilters, GovernedEntity } from './types.js';

/**
 * Check if an entity passes governance eligibility checks.
 *
 * Rules (all must pass):
 * 1. lifecycleState === 'approved'
 * 2. System admin bypass OR:
 *    - Not in terminal decay state (expired/superseded)
 *    - Caller securityLevel >= entity.requiredLevel
 *    - Team access: entity has no team OR entity.teamId matches caller.teamId
 *
 * @param entity - The governed entity to check
 * @param context - Caller's governance context
 * @param options - Optional eligibility options (e.g., excludeDecayed)
 * @returns true if entity is eligible for access
 */
export function isGovernanceEligible(
  entity: GovernedEntity,
  context: GovernanceContext,
  options?: EligibilityOptions,
): boolean {
  // Must be approved
  if (entity.lifecycleState !== 'approved') {
    return false;
  }

  // System admin can access everything (before decay check)
  if (context.isSystemAdmin) {
    return true;
  }

  // Hard decay: exclude expired and superseded from default retrieval
  const excludeDecayed = options?.excludeDecayed !== false;
  if (excludeDecayed && entity.decayState !== undefined) {
    if (entity.decayState === 'expired' || entity.decayState === 'superseded') {
      return false;
    }
  }

  // Security level check: caller must have >= required level
  if (context.securityLevel < entity.requiredLevel) {
    return false;
  }

  // Team access check:
  // - Global entities (teamId === null) are accessible to all
  // - Project entities require matching teamId
  if (entity.teamId !== null && entity.teamId !== context.teamId) {
    return false;
  }

  return true;
}

/**
 * Check if an entity passes optional scope and label filters.
 *
 * @param entity - The governed entity to check
 * @param filters - Optional scope and label filters
 * @returns true if entity matches filters (or filters are empty)
 */
export function matchesGovernanceFilters(
  entity: GovernedEntity & { labels: string[] },
  filters: GovernanceFilters,
): boolean {
  // Scope filter: if specified, entity scope must match
  if (filters.scopes.length > 0 && !filters.scopes.includes(entity.scope)) {
    return false;
  }

  // Label filter: all requested labels must be present
  if (filters.labels.length > 0) {
    const hasAllLabels = filters.labels.every((label) => entity.labels.includes(label));
    if (!hasAllLabels) {
      return false;
    }
  }

  return true;
}

/**
 * Combined governance check with eligibility and filters.
 *
 * @param entity - The governed entity to check
 * @param context - Caller's governance context
 * @param filters - Optional scope and label filters
 * @param eligibilityOptions - Optional eligibility options (e.g., excludeDecayed)
 * @returns true if entity passes all checks
 */
export function isGovernedEntityAccessible(
  entity: GovernedEntity & { labels: string[] },
  context: GovernanceContext,
  filters: GovernanceFilters,
  eligibilityOptions?: EligibilityOptions,
): boolean {
  return (
    isGovernanceEligible(entity, context, eligibilityOptions) &&
    matchesGovernanceFilters(entity, filters)
  );
}

/**
 * Filter an array of governed entities by eligibility.
 *
 * @param entities - Array of entities to filter
 * @param context - Caller's governance context
 * @param filters - Optional scope and label filters
 * @param eligibilityOptions - Optional eligibility options (e.g., excludeDecayed)
 * @returns Filtered array of eligible entities
 */
export function filterGovernedEntities<T extends GovernedEntity & { labels: string[] }>(
  entities: T[],
  context: GovernanceContext,
  filters: GovernanceFilters,
  eligibilityOptions?: EligibilityOptions,
): T[] {
  return entities.filter((entity) =>
    isGovernedEntityAccessible(entity, context, filters, eligibilityOptions),
  );
}
