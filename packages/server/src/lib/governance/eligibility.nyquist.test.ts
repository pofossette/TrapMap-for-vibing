/**
 * Nyquist adversarial validation tests for governance eligibility.
 *
 * Validates gap claims:
 * - isGovernanceEligible rejects non-approved lifecycle states
 * - isGovernanceEligible enforces decay, security, team rules
 * - System admin bypasses all checks including decay
 * - matchesGovernanceFilters uses AND semantics for labels
 * - filterGovernedEntities returns correct subset with reference identity
 */

import { describe, expect, it } from 'vitest';
import type { EligibilityOptions, GovernanceContext, GovernanceFilters, GovernedEntity } from './types.js';
import {
  filterGovernedEntities,
  isGovernedEntityAccessible,
  isGovernanceEligible,
  matchesGovernanceFilters,
} from './eligibility.js';

type TestEntity = GovernedEntity & { labels: string[] };

function makeEntity(overrides: Partial<TestEntity> = {}): TestEntity {
  return {
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    labels: [],
    decayState: undefined,
    boundary: null,
    ...overrides,
  };
}

function makeContext(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    teamId: null,
    securityLevel: 5,
    isSystemAdmin: false,
    ...overrides,
  };
}

function makeFilters(overrides: Partial<GovernanceFilters> = {}): GovernanceFilters {
  return {
    scopes: [],
    labels: [],
    ...overrides,
  };
}

describe('Nyquist: isGovernanceEligible rejects non-approved lifecycle states', () => {
  const nonApprovedStates = ['submitted', 'agent-pass', 'rejected', 'deactivated'] as const;

  for (const state of nonApprovedStates) {
    it(`returns false for lifecycleState="${state}"`, () => {
      const entity = makeEntity({ lifecycleState: state });
      expect(isGovernanceEligible(entity, makeContext())).toBe(false);
    });
  }

  it('returns true for lifecycleState="approved"', () => {
    const entity = makeEntity({ lifecycleState: 'approved' });
    expect(isGovernanceEligible(entity, makeContext())).toBe(true);
  });
});

describe('Nyquist: isGovernanceEligible enforces decay rules', () => {
  it('returns false for decayState="expired" (non-admin, default options)', () => {
    const entity = makeEntity({ decayState: 'expired' });
    expect(isGovernanceEligible(entity, makeContext())).toBe(false);
  });

  it('returns false for decayState="superseded" (non-admin, default options)', () => {
    const entity = makeEntity({ decayState: 'superseded' });
    expect(isGovernanceEligible(entity, makeContext())).toBe(false);
  });

  it('returns true for decayState="active"', () => {
    const entity = makeEntity({ decayState: 'active' });
    expect(isGovernanceEligible(entity, makeContext())).toBe(true);
  });

  it('returns true for decayState="aging"', () => {
    const entity = makeEntity({ decayState: 'aging' });
    expect(isGovernanceEligible(entity, makeContext())).toBe(true);
  });

  it('returns true for expired entity when excludeDecayed is explicitly false', () => {
    const entity = makeEntity({ decayState: 'expired' });
    const opts: EligibilityOptions = { excludeDecayed: false };
    expect(isGovernanceEligible(entity, makeContext(), opts)).toBe(true);
  });
});

describe('Nyquist: isGovernanceEligible enforces security level', () => {
  it('returns false when caller level is strictly below requiredLevel', () => {
    const entity = makeEntity({ requiredLevel: 8 });
    const context = makeContext({ securityLevel: 3 });
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns true when caller level equals requiredLevel (boundary)', () => {
    const entity = makeEntity({ requiredLevel: 5 });
    const context = makeContext({ securityLevel: 5 });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns true when caller level exceeds requiredLevel', () => {
    const entity = makeEntity({ requiredLevel: 3 });
    const context = makeContext({ securityLevel: 7 });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });
});

describe('Nyquist: isGovernanceEligible enforces team boundary', () => {
  it('returns false when entity has teamId and context has different teamId', () => {
    const entity = makeEntity({ teamId: 'team_A' });
    const context = makeContext({ teamId: 'team_B' });
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns true when entity has teamId and context has matching teamId', () => {
    const entity = makeEntity({ teamId: 'team_A' });
    const context = makeContext({ teamId: 'team_A' });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns true when entity teamId is null (global entity)', () => {
    const entity = makeEntity({ teamId: null });
    const context = makeContext({ teamId: 'team_X' });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });
});

describe('Nyquist: system admin bypasses all governance checks', () => {
  it('bypasses decay, security level, and team checks simultaneously', () => {
    const entity = makeEntity({
      requiredLevel: 10,
      teamId: 'other-team',
      decayState: 'expired',
    });
    const context = makeContext({
      isSystemAdmin: true,
      securityLevel: 0,
      teamId: 'my-team',
    });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });
});

describe('Nyquist: matchesGovernanceFilters AND semantics', () => {
  it('returns true only when ALL filter labels are present on entity', () => {
    const entity = makeEntity({ labels: ['a', 'b', 'c'] });
    const filters = makeFilters({ labels: ['a', 'b'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(true);
  });

  it('returns false when only SOME filter labels are present', () => {
    const entity = makeEntity({ labels: ['a'] });
    const filters = makeFilters({ labels: ['a', 'b'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(false);
  });

  it('returns false when entity scope does not match filter scopes', () => {
    const entity = makeEntity({ scope: 'global' });
    const filters = makeFilters({ scopes: ['project'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(false);
  });

  it('returns true for empty filters (no constraints)', () => {
    const entity = makeEntity();
    expect(matchesGovernanceFilters(entity, makeFilters())).toBe(true);
  });
});

describe('Nyquist: filterGovernedEntities composes eligibility and filters', () => {
  it('returns only entities that pass BOTH eligibility AND filter checks', () => {
    const good = makeEntity({ scope: 'global', labels: ['x'] });
    const wrongScope = makeEntity({ scope: 'project', labels: ['x'] });
    const wrongLifecycle = makeEntity({ lifecycleState: 'rejected', scope: 'global', labels: ['x'] });

    const result = filterGovernedEntities(
      [good, wrongScope, wrongLifecycle],
      makeContext(),
      makeFilters({ scopes: ['global'] }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(good);
  });

  it('preserves object references from input', () => {
    const e1 = makeEntity({ scope: 'global' });
    const e2 = makeEntity({ scope: 'global' });
    const result = filterGovernedEntities([e1, e2], makeContext(), makeFilters());
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(e2);
  });
});
