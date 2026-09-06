import { describe, expect, it } from 'vitest';

import {
  computeDecayState,
  decayStateForAge,
  isEligibleForActor,
  isRetrievalEntryEligible,
  type KnowledgeDecayConfig,
  matchesRetrievalFilters,
  type RetrievalAuthView,
  type RetrievalEligibilityEntryView,
} from '../../../src/knowledge-read/domain/index.js';

const DEFAULT_DECAY_CONFIG: KnowledgeDecayConfig = {
  reviewDueDays: 90,
  staleDays: 180,
  expireDays: 365,
  enabled: true,
};

function createEntry(
  overrides: Partial<RetrievalEligibilityEntryView> = {},
): RetrievalEligibilityEntryView {
  return {
    lifecycleState: 'approved',
    decayMeta: {
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      decayState: 'active',
      supersededById: null,
    },
    teamId: null,
    requiredLevel: 0,
    scope: 'global',
    labels: [],
    ...overrides,
  };
}

function createAuth(overrides: Partial<RetrievalAuthView> = {}): RetrievalAuthView {
  return {
    subjectType: 'user',
    securityLevel: 0,
    activeTeamId: null,
    ...overrides,
  };
}

describe('knowledge-read eligibility rules', () => {
  it('derives decay state from last verification age', () => {
    const config = DEFAULT_DECAY_CONFIG;
    const now = Date.now();
    expect(decayStateForAge(new Date(now - 30 * 86_400_000).toISOString(), config)).toBe('active');
    expect(decayStateForAge(new Date(now - 120 * 86_400_000).toISOString(), config)).toBe(
      'review-due',
    );
    expect(decayStateForAge(new Date(now - 200 * 86_400_000).toISOString(), config)).toBe('stale');
    expect(decayStateForAge(new Date(now - 400 * 86_400_000).toISOString(), config)).toBe(
      'expired',
    );
  });

  it('preserves the persisted decay state when decay is disabled', () => {
    expect(
      computeDecayState(
        { lastVerifiedAt: '2020-01-01T00:00:00.000Z', decayState: 'active', supersededById: null },
        { ...DEFAULT_DECAY_CONFIG, enabled: false },
      ),
    ).toBe('active');
  });

  it('lets superseded entries win over age-based decay', () => {
    expect(
      computeDecayState(
        {
          lastVerifiedAt: '2026-01-01T00:00:00.000Z',
          decayState: 'active',
          supersededById: 'entry-2',
        },
        DEFAULT_DECAY_CONFIG,
      ),
    ).toBe('superseded');
    expect(
      computeDecayState(
        {
          lastVerifiedAt: '2026-01-01T00:00:00.000Z',
          decayState: 'superseded',
          supersededById: null,
        },
        DEFAULT_DECAY_CONFIG,
      ),
    ).toBe('superseded');
  });

  it('rejects expired or superseded entries for non-admin actors', () => {
    const auth = createAuth();
    expect(isEligibleForActor(createEntry(), auth, 'expired')).toBe(false);
    expect(isEligibleForActor(createEntry(), auth, 'superseded')).toBe(false);
    expect(isEligibleForActor(createEntry(), auth, 'stale')).toBe(true);
    expect(isEligibleForActor(createEntry(), auth, undefined)).toBe(true);
  });

  it('lets system admins bypass decay, level and team gates', () => {
    const auth = createAuth({ subjectType: 'system-admin', securityLevel: 0, activeTeamId: null });
    expect(isEligibleForActor(createEntry(), auth, 'expired')).toBe(true);
  });

  it('enforces security level and team access for regular users', () => {
    const auth = createAuth({ securityLevel: 2, activeTeamId: 'team-1' });
    expect(isEligibleForActor(createEntry({ requiredLevel: 3 }), auth, undefined)).toBe(false);
    expect(isEligibleForActor(createEntry({ requiredLevel: 2 }), auth, undefined)).toBe(true);
    expect(isEligibleForActor(createEntry({ teamId: 'team-2' }), auth, undefined)).toBe(false);
    expect(isEligibleForActor(createEntry({ teamId: 'team-1' }), auth, undefined)).toBe(true);
    expect(isEligibleForActor(createEntry({ teamId: null }), auth, undefined)).toBe(true);
  });

  it('matches retrieval filters on scopes and all labels', () => {
    const entry = createEntry({ scope: 'project', labels: ['deploy', 'k8s'] });
    expect(matchesRetrievalFilters(entry, { scopes: [], labels: [] })).toBe(true);
    expect(matchesRetrievalFilters(entry, { scopes: ['project'], labels: [] })).toBe(true);
    expect(matchesRetrievalFilters(entry, { scopes: ['global'], labels: [] })).toBe(false);
    expect(matchesRetrievalFilters(entry, { scopes: [], labels: ['deploy'] })).toBe(true);
    expect(matchesRetrievalFilters(entry, { scopes: [], labels: ['deploy', 'missing'] })).toBe(
      false,
    );
  });

  it('requires the approved lifecycle state for full eligibility', () => {
    const auth = createAuth();
    const filters = { scopes: [], labels: [] };
    expect(isRetrievalEntryEligible(createEntry(), auth, filters, DEFAULT_DECAY_CONFIG)).toBe(true);
    expect(
      isRetrievalEntryEligible(
        createEntry({ lifecycleState: 'submitted' }),
        auth,
        filters,
        DEFAULT_DECAY_CONFIG,
      ),
    ).toBe(false);
    expect(
      isRetrievalEntryEligible(
        createEntry({
          decayMeta: {
            lastVerifiedAt: '2020-01-01T00:00:00.000Z',
            decayState: 'active',
            supersededById: null,
          },
        }),
        auth,
        filters,
        DEFAULT_DECAY_CONFIG,
      ),
    ).toBe(false);
  });
});
