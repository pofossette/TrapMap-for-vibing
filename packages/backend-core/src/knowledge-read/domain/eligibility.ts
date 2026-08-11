/**
 * Knowledge-read bounded context — retrieval eligibility policy.
 *
 * Pure eligibility judgment rules (decay state computation, actor
 * eligibility, filter matching) with zero framework, DB or I/O imports.
 * The support infrastructure renders these rules with env-derived decay
 * configuration; recall channels are not involved.
 */

import type { RetrievalQuery } from '@trapmap/contracts';

export interface KnowledgeDecayMetaView {
  lastVerifiedAt: string;
  decayState: string;
  supersededById: string | null;
}

export interface KnowledgeDecayConfig {
  reviewDueDays: number;
  staleDays: number;
  expireDays: number;
  enabled: boolean;
}

export interface RetrievalEligibilityEntryView {
  lifecycleState: string;
  decayMeta: KnowledgeDecayMetaView | null;
  teamId: string | null;
  requiredLevel: number;
  scope: 'global' | 'project';
  labels: readonly string[];
}

export interface RetrievalAuthView {
  subjectType: string;
  securityLevel: number;
  activeTeamId: string | null;
}

export type RetrievalDecayState = 'active' | 'review-due' | 'stale' | 'expired';

/** Decay state derived purely from the last verification age. */
export function decayStateForAge(
  lastVerifiedAt: string,
  config: KnowledgeDecayConfig,
): RetrievalDecayState {
  const ageDays = (Date.now() - new Date(lastVerifiedAt).getTime()) / 86_400_000;
  if (ageDays >= config.expireDays) return 'expired';
  if (ageDays >= config.staleDays) return 'stale';
  if (ageDays >= config.reviewDueDays) return 'review-due';
  return 'active';
}

/**
 * Decay state for an entry: superseded wins over age; disabled decay
 * config preserves the persisted state.
 */
export function computeDecayState(
  decayMeta: KnowledgeDecayMetaView | null | undefined,
  config: KnowledgeDecayConfig,
): string | undefined {
  if (!decayMeta) return undefined;
  if (!config.enabled) return decayMeta.decayState;
  if (decayMeta.supersededById || decayMeta.decayState === 'superseded') return 'superseded';
  return decayStateForAge(decayMeta.lastVerifiedAt, config);
}

/** Actor-side eligibility: system admins bypass; others need level + team. */
export function isEligibleForActor(
  entry: RetrievalEligibilityEntryView,
  auth: RetrievalAuthView,
  decayState: string | undefined,
): boolean {
  if (auth.subjectType === 'system-admin') return true;
  return (
    decayState !== 'expired' &&
    decayState !== 'superseded' &&
    auth.securityLevel >= entry.requiredLevel &&
    (entry.teamId === null || entry.teamId === auth.activeTeamId)
  );
}

/** Query filter matching: scope inclusion and all-labels matching. */
export function matchesRetrievalFilters(
  entry: RetrievalEligibilityEntryView,
  filters: RetrievalQuery['filters'],
): boolean {
  return (
    (filters.scopes.length === 0 || filters.scopes.includes(entry.scope)) &&
    filters.labels.every((label) => entry.labels.includes(label))
  );
}

/** Full retrieval eligibility: approved lifecycle + actor + filter gates. */
export function isRetrievalEntryEligible(
  entry: RetrievalEligibilityEntryView,
  auth: RetrievalAuthView,
  filters: RetrievalQuery['filters'],
  decayConfig: KnowledgeDecayConfig,
): boolean {
  const decayState = computeDecayState(entry.decayMeta, decayConfig);
  return (
    entry.lifecycleState === 'approved' &&
    isEligibleForActor(entry, auth, decayState) &&
    matchesRetrievalFilters(entry, filters)
  );
}
