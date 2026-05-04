/**
 * Tests for governance eligibility functions.
 *
 * Covers all 4 exported functions from eligibility.ts:
 * - isGovernanceEligible
 * - matchesGovernanceFilters
 * - isGovernedEntityAccessible
 * - filterGovernedEntities
 */

import { describe, expect, it } from 'vitest';
import {
  filterGovernedEntities,
  isGovernanceEligible,
  isGovernedEntityAccessible,
  matchesGovernanceFilters,
} from './eligibility.js';
import type {
  EligibilityOptions,
  GovernanceContext,
  GovernanceFilters,
  GovernedEntity,
} from './types.js';

type TestEntity = GovernedEntity & { labels: string[] };

function createTestEntity(overrides: Partial<TestEntity> = {}): TestEntity {
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

function createTestContext(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    teamId: null,
    securityLevel: 5,
    isSystemAdmin: false,
    ...overrides,
  };
}

function createTestFilters(overrides: Partial<GovernanceFilters> = {}): GovernanceFilters {
  return {
    scopes: [],
    labels: [],
    ...overrides,
  };
}

describe('isGovernanceEligible', () => {
  it('returns false when lifecycleState is submitted', () => {
    const entity = createTestEntity({ lifecycleState: 'submitted' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns false when lifecycleState is agent-pass', () => {
    const entity = createTestEntity({ lifecycleState: 'agent-pass' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns false when lifecycleState is rejected', () => {
    const entity = createTestEntity({ lifecycleState: 'rejected' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns false when lifecycleState is deactivated', () => {
    const entity = createTestEntity({ lifecycleState: 'deactivated' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns true for approved entity with default context (happy path)', () => {
    const entity = createTestEntity({ lifecycleState: 'approved' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('system admin bypasses ALL checks', () => {
    const entity = createTestEntity({
      requiredLevel: 10,
      teamId: 'other-team',
      decayState: 'expired',
    });
    const context = createTestContext({
      isSystemAdmin: true,
      securityLevel: 0,
      teamId: 'my-team',
    });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('system admin bypasses before decay check', () => {
    const entity = createTestEntity({
      lifecycleState: 'approved',
      decayState: 'expired',
    });
    const context = createTestContext({ isSystemAdmin: true });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns false when decayState is expired (non-admin)', () => {
    const entity = createTestEntity({ decayState: 'expired' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns false when decayState is superseded (non-admin)', () => {
    const entity = createTestEntity({ decayState: 'superseded' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns true when decayState is active (non-admin, eligible)', () => {
    const entity = createTestEntity({ decayState: 'active' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns true when decayState is aging (non-admin, eligible)', () => {
    const entity = createTestEntity({ decayState: 'aging' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns false when caller securityLevel < entity.requiredLevel', () => {
    const entity = createTestEntity({ requiredLevel: 8 });
    const context = createTestContext({ securityLevel: 3 });
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns true when caller securityLevel equals entity.requiredLevel (boundary)', () => {
    const entity = createTestEntity({ requiredLevel: 5 });
    const context = createTestContext({ securityLevel: 5 });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns true when caller securityLevel > entity.requiredLevel', () => {
    const entity = createTestEntity({ requiredLevel: 5 });
    const context = createTestContext({ securityLevel: 8 });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns false when entity has teamId and context has different teamId', () => {
    const entity = createTestEntity({ teamId: 'team_A' });
    const context = createTestContext({ teamId: 'team_B' });
    expect(isGovernanceEligible(entity, context)).toBe(false);
  });

  it('returns true when entity has teamId and context has matching teamId', () => {
    const entity = createTestEntity({ teamId: 'team_A' });
    const context = createTestContext({ teamId: 'team_A' });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns true when entity teamId is null (global entity, accessible to all)', () => {
    const entity = createTestEntity({ teamId: null });
    const context = createTestContext({ teamId: 'team_X' });
    expect(isGovernanceEligible(entity, context)).toBe(true);
  });

  it('returns true for expired entity when excludeDecayed is false', () => {
    const entity = createTestEntity({ decayState: 'expired' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context, { excludeDecayed: false })).toBe(true);
  });

  it('returns false for expired entity when excludeDecayed is explicitly true', () => {
    const entity = createTestEntity({ decayState: 'expired' });
    const context = createTestContext();
    expect(isGovernanceEligible(entity, context, { excludeDecayed: true })).toBe(false);
  });
});

describe('matchesGovernanceFilters', () => {
  it('returns true for empty filters', () => {
    const entity = createTestEntity();
    const filters = createTestFilters();
    expect(matchesGovernanceFilters(entity, filters)).toBe(true);
  });

  it('returns true when entity scope matches filter scope', () => {
    const entity = createTestEntity({ scope: 'project' });
    const filters = createTestFilters({ scopes: ['project'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(true);
  });

  it('returns false when entity scope does NOT match filter scope', () => {
    const entity = createTestEntity({ scope: 'global' });
    const filters = createTestFilters({ scopes: ['project'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(false);
  });

  it('returns true when all requested labels are present on entity (AND semantics)', () => {
    const entity = createTestEntity({ labels: ['typescript', 'react', 'testing'] });
    const filters = createTestFilters({ labels: ['typescript', 'react'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(true);
  });

  it('returns false when only SOME requested labels are present', () => {
    const entity = createTestEntity({ labels: ['typescript'] });
    const filters = createTestFilters({ labels: ['typescript', 'react'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(false);
  });

  it('returns false when NO requested labels are present', () => {
    const entity = createTestEntity({ labels: ['python'] });
    const filters = createTestFilters({ labels: ['typescript', 'react'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(false);
  });

  it('returns true when scopes match AND labels match', () => {
    const entity = createTestEntity({ scope: 'project', labels: ['typescript'] });
    const filters = createTestFilters({ scopes: ['project'], labels: ['typescript'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(true);
  });

  it('returns false when scopes match but labels do not', () => {
    const entity = createTestEntity({ scope: 'project', labels: ['python'] });
    const filters = createTestFilters({ scopes: ['project'], labels: ['typescript'] });
    expect(matchesGovernanceFilters(entity, filters)).toBe(false);
  });
});

describe('isGovernedEntityAccessible', () => {
  it('returns true when both eligible and matches filters', () => {
    const entity = createTestEntity({ scope: 'global', labels: ['a'] });
    const context = createTestContext();
    const filters = createTestFilters({ scopes: ['global'], labels: ['a'] });
    expect(isGovernedEntityAccessible(entity, context, filters)).toBe(true);
  });

  it('returns false when eligible but does NOT match filters', () => {
    const entity = createTestEntity({ scope: 'project', labels: ['a'] });
    const context = createTestContext();
    const filters = createTestFilters({ scopes: ['global'] });
    expect(isGovernedEntityAccessible(entity, context, filters)).toBe(false);
  });

  it('returns false when NOT eligible but matches filters', () => {
    const entity = createTestEntity({
      lifecycleState: 'rejected',
      scope: 'global',
      labels: ['a'],
    });
    const context = createTestContext();
    const filters = createTestFilters({ scopes: ['global'], labels: ['a'] });
    expect(isGovernedEntityAccessible(entity, context, filters)).toBe(false);
  });

  it('returns false when neither eligible nor matches filters', () => {
    const entity = createTestEntity({
      lifecycleState: 'rejected',
      scope: 'project',
      labels: ['a'],
    });
    const context = createTestContext();
    const filters = createTestFilters({ scopes: ['global'] });
    expect(isGovernedEntityAccessible(entity, context, filters)).toBe(false);
  });
});

describe('filterGovernedEntities', () => {
  it('returns empty array for empty input array', () => {
    const result = filterGovernedEntities([], createTestContext(), createTestFilters());
    expect(result).toEqual([]);
  });

  it('returns only eligible entities that match filters from mixed input', () => {
    const eligible = createTestEntity({ scope: 'global', labels: ['a'] });
    const ineligibleLifecycle = createTestEntity({
      lifecycleState: 'rejected',
      scope: 'global',
      labels: ['a'],
    });
    const wrongScope = createTestEntity({ scope: 'project', labels: ['a'] });
    const result = filterGovernedEntities(
      [eligible, ineligibleLifecycle, wrongScope],
      createTestContext(),
      createTestFilters({ scopes: ['global'] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(eligible);
  });

  it('returns all entities when all are eligible and match filters', () => {
    const e1 = createTestEntity({ scope: 'global', labels: ['a'] });
    const e2 = createTestEntity({ scope: 'global', labels: ['a'] });
    const e3 = createTestEntity({ scope: 'global', labels: ['a'] });
    const result = filterGovernedEntities(
      [e1, e2, e3],
      createTestContext(),
      createTestFilters({ scopes: ['global'] }),
    );
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no entities are eligible', () => {
    const e1 = createTestEntity({ lifecycleState: 'rejected' });
    const e2 = createTestEntity({ lifecycleState: 'submitted' });
    const result = filterGovernedEntities([e1, e2], createTestContext(), createTestFilters());
    expect(result).toEqual([]);
  });

  it('preserves entity object references (same objects from input)', () => {
    const e1 = createTestEntity({ scope: 'global' });
    const e2 = createTestEntity({ scope: 'global' });
    const result = filterGovernedEntities([e1, e2], createTestContext(), createTestFilters());
    expect(result).toContain(e1);
    expect(result).toContain(e2);
    // Verify identity (same reference, not just deep equal)
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(e2);
  });
});
