import { beforeEach, describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../store.js';
import { nowIso } from '../store.js';
import { filterEligibleEntries } from './filters.js';
import { selectRetrievalStrategy, selectRetrievalStrategyV2 } from './orchestrator.js';
import type { ResolvedAuthContext } from '../context.js';

describe('selectRetrievalStrategy (v1)', () => {
  describe('explicit mode mapping', () => {
    it('maps semantic to local strategy with correct channels', () => {
      const decision = selectRetrievalStrategy('semantic', 'test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.routeFamily).toBe('entry');
      expect(decision.routingReason).toBe('explicit-mode');
      expect(decision.fallbackApplied).toBe(false);
      expect(decision.channelsPlanned).toEqual(['semantic']);
      expect(decision.channelsUsed).toEqual([]);
    });

    it('maps hybrid to hybrid strategy with semantic+keyword channels', () => {
      const decision = selectRetrievalStrategy('hybrid', 'test query');

      expect(decision.selectedMode).toBe('hybrid');
      expect(decision.routeFamily).toBe('entry');
      expect(decision.routingReason).toBe('explicit-mode');
      expect(decision.channelsPlanned).toEqual(['semantic', 'keyword']);
    });

    it('maps graph-assisted to mix strategy with all entry channels', () => {
      const decision = selectRetrievalStrategy('graph-assisted', 'test query');

      expect(decision.selectedMode).toBe('mix');
      expect(decision.routeFamily).toBe('entry');
      expect(decision.routingReason).toBe('explicit-mode');
      expect(decision.channelsPlanned).toEqual(['semantic', 'keyword', 'graph']);
    });
  });

  describe('fallback behavior', () => {
    it('falls back to local for unknown mode', () => {
      const decision = selectRetrievalStrategy('unknown-mode', 'test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.fallbackApplied).toBe(true);
      expect(decision.channelsPlanned).toEqual(['semantic']);
    });
  });

  describe('deterministic routing metadata', () => {
    it('produces identical output for identical input', () => {
      const d1 = selectRetrievalStrategy('hybrid', 'docker container networking');
      const d2 = selectRetrievalStrategy('hybrid', 'docker container networking');

      expect(d1).toEqual(d2);
    });

    it('always includes routingReason in decision', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.routingReason).toBe('explicit-mode');
        expect(decision.routingReason).toBeTruthy();
      }
    });

    it('always sets routeFamily to entry', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.routeFamily).toBe('entry');
      }
    });

    it('initializes channelsUsed as empty (populated after recall)', () => {
      const decision = selectRetrievalStrategy('hybrid', 'test');
      expect(decision.channelsUsed).toEqual([]);
    });
  });
});

describe('selectRetrievalStrategyV2', () => {
  describe('default capsule strategy', () => {
    it('selects local strategy with capsule route family', () => {
      const decision = selectRetrievalStrategyV2('test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.routeFamily).toBe('capsule');
      expect(decision.routingReason).toBe('v2-default-capsule');
      expect(decision.fallbackApplied).toBe(false);
      expect(decision.channelsPlanned).toEqual(['capsule', 'profile']);
      expect(decision.channelsUsed).toEqual([]);
    });
  });

  describe('deterministic routing metadata', () => {
    it('produces identical output for identical seed', () => {
      const d1 = selectRetrievalStrategyV2('docker container networking');
      const d2 = selectRetrievalStrategyV2('docker container networking');

      expect(d1).toEqual(d2);
    });

    it('always sets routeFamily to capsule', () => {
      const seeds = ['test', 'another query', 'error: something failed'];
      for (const seed of seeds) {
        const decision = selectRetrievalStrategyV2(seed);
        expect(decision.routeFamily).toBe('capsule');
      }
    });

    it('always includes routingReason in decision', () => {
      const decision = selectRetrievalStrategyV2('any seed');
      expect(decision.routingReason).toBe('v2-default-capsule');
      expect(decision.routingReason).toBeTruthy();
    });
  });
});

// =============================================================================
// Phase 29-02: Governance filtering for routed strategies (T-29-04)
// Tests that prove forbidden content stays absent for routed non-default strategies.
// Governance filtering must happen before recall regardless of which strategy is selected.
// =============================================================================

describe('Phase 29-02: Governance filtering for routed strategies', () => {
  const teamId = 'team_gov_test';
  const otherTeamId = 'team_other_gov';
  const userId = 'user_gov_test';

  // Helper to create a mock knowledge entry
  function createMockEntry(overrides: {
    id: string;
    teamId: string | null;
    scope: 'global' | 'project';
    lifecycleState: 'approved' | 'pending' | 'rejected';
    requiredLevel: number;
    shortcut: string;
    detail: string;
    labels?: string[];
  }): KnowledgeRecord {
    const createdAt = nowIso();
    return {
      id: overrides.id,
      teamId: overrides.teamId,
      scope: overrides.scope,
      labels: overrides.labels ?? [],
      shortcut: overrides.shortcut,
      detail: overrides.detail,
      requiredLevel: overrides.requiredLevel,
      lifecycleState: overrides.lifecycleState,
      ownerUserId: userId,
      latestRevision: {
        revision: 1,
        submittedAt: createdAt,
        submittedByUserId: userId,
        shortcut: overrides.shortcut,
        detail: overrides.detail,
        labels: overrides.labels ?? [],
        reviewNotes: [],
      },
      history: [
        {
          revision: 1,
          submittedAt: createdAt,
          submittedByUserId: userId,
          shortcut: overrides.shortcut,
          detail: overrides.detail,
          labels: overrides.labels ?? [],
          reviewNotes: [],
        },
      ],
      metadata: {
        scopeLabel: overrides.scope === 'global' ? 'global-constraint' : 'project-knowledge',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: `sub_${overrides.id}`,
        latestSubmittedAt: createdAt,
        latestReviewedAt: overrides.lifecycleState === 'approved' ? createdAt : null,
        latestDecision: overrides.lifecycleState === 'approved' ? 'approve' : null,
      },
      lifecycleHistory: [],
      reviewHistory: [],
      agentReview: null,
      embeddingCache: null,
      indexState: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  // Helper to create mock auth context
  function createMockAuth(overrides: {
    activeTeamId: string | null;
    securityLevel: number;
    isSystemAdmin?: boolean;
  }): ResolvedAuthContext {
    return {
      actorId: userId,
      actorType: 'user',
      handle: 'testuser',
      activeTeamId: overrides.activeTeamId,
      securityLevel: overrides.securityLevel,
      subjectType: overrides.isSystemAdmin ? 'system-admin' : 'user',
      roleTemplate: 'user',
      permissions: ['knowledge:search'],
    };
  }

  let approvedGlobalEntry: KnowledgeRecord;
  let approvedTeamEntry: KnowledgeRecord;
  let pendingEntry: KnowledgeRecord;
  let highLevelEntry: KnowledgeRecord;
  let otherTeamEntry: KnowledgeRecord;

  beforeEach(() => {
    approvedGlobalEntry = createMockEntry({
      id: 'entry_global_approved',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      shortcut: 'Approved Global Entry',
      detail: 'This is an approved global constraint',
      labels: ['global', 'approved'],
    });

    approvedTeamEntry = createMockEntry({
      id: 'entry_team_approved',
      teamId: teamId,
      scope: 'project',
      lifecycleState: 'approved',
      requiredLevel: 3,
      shortcut: 'Approved Team Entry',
      detail: 'This is an approved team entry',
      labels: ['team', 'approved'],
    });

    pendingEntry = createMockEntry({
      id: 'entry_pending',
      teamId: teamId,
      scope: 'project',
      lifecycleState: 'pending',
      requiredLevel: 0,
      shortcut: 'Pending Entry',
      detail: 'This entry is pending approval and should not appear',
      labels: ['pending'],
    });

    highLevelEntry = createMockEntry({
      id: 'entry_high_level',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 10,
      shortcut: 'High Security Entry',
      detail: 'This entry requires high security clearance',
      labels: ['security', 'high'],
    });

    otherTeamEntry = createMockEntry({
      id: 'entry_other_team',
      teamId: otherTeamId,
      scope: 'project',
      lifecycleState: 'approved',
      requiredLevel: 0,
      shortcut: 'Other Team Entry',
      detail: 'This entry belongs to another team and should not appear',
      labels: ['other-team'],
    });
  });

  describe('governance filtering for all routed strategies (T-29-04)', () => {
    it('filters out forbidden entries for semantic (local) strategy', () => {
      const routing = selectRetrievalStrategy('semantic', 'test query');
      expect(routing.selectedMode).toBe('local');

      const auth = createMockAuth({ activeTeamId: teamId, securityLevel: 5 });
      const entries = [approvedGlobalEntry, approvedTeamEntry, pendingEntry, highLevelEntry, otherTeamEntry];
      const filters = { labels: [], scopes: [] };

      const eligible = filterEligibleEntries(entries, auth, filters);

      // Should only include approved global and matching team entries
      expect(eligible.map((e) => e.id)).toContain('entry_global_approved');
      expect(eligible.map((e) => e.id)).toContain('entry_team_approved');
      expect(eligible.map((e) => e.id)).not.toContain('entry_pending');
      expect(eligible.map((e) => e.id)).not.toContain('entry_high_level');
      expect(eligible.map((e) => e.id)).not.toContain('entry_other_team');
    });

    it('filters out forbidden entries for hybrid strategy', () => {
      const routing = selectRetrievalStrategy('hybrid', 'test query');
      expect(routing.selectedMode).toBe('hybrid');

      const auth = createMockAuth({ activeTeamId: teamId, securityLevel: 5 });
      const entries = [approvedGlobalEntry, approvedTeamEntry, pendingEntry, highLevelEntry, otherTeamEntry];
      const filters = { labels: [], scopes: [] };

      const eligible = filterEligibleEntries(entries, auth, filters);

      // Hybrid strategy must still enforce governance
      expect(eligible.map((e) => e.id)).toContain('entry_global_approved');
      expect(eligible.map((e) => e.id)).toContain('entry_team_approved');
      expect(eligible.map((e) => e.id)).not.toContain('entry_pending');
      expect(eligible.map((e) => e.id)).not.toContain('entry_high_level');
      expect(eligible.map((e) => e.id)).not.toContain('entry_other_team');
    });

    it('filters out forbidden entries for graph-assisted (mix) strategy', () => {
      const routing = selectRetrievalStrategy('graph-assisted', 'test query');
      expect(routing.selectedMode).toBe('mix');

      const auth = createMockAuth({ activeTeamId: teamId, securityLevel: 5 });
      const entries = [approvedGlobalEntry, approvedTeamEntry, pendingEntry, highLevelEntry, otherTeamEntry];
      const filters = { labels: [], scopes: [] };

      const eligible = filterEligibleEntries(entries, auth, filters);

      // Mix strategy must still enforce governance
      expect(eligible.map((e) => e.id)).toContain('entry_global_approved');
      expect(eligible.map((e) => e.id)).toContain('entry_team_approved');
      expect(eligible.map((e) => e.id)).not.toContain('entry_pending');
      expect(eligible.map((e) => e.id)).not.toContain('entry_high_level');
      expect(eligible.map((e) => e.id)).not.toContain('entry_other_team');
    });

    it('filters out forbidden entries for fallback strategy', () => {
      const routing = selectRetrievalStrategy('unknown-mode', 'test query');
      expect(routing.selectedMode).toBe('local');
      expect(routing.fallbackApplied).toBe(true);

      const auth = createMockAuth({ activeTeamId: teamId, securityLevel: 5 });
      const entries = [approvedGlobalEntry, approvedTeamEntry, pendingEntry, highLevelEntry, otherTeamEntry];
      const filters = { labels: [], scopes: [] };

      const eligible = filterEligibleEntries(entries, auth, filters);

      // Fallback strategy must still enforce governance
      expect(eligible.map((e) => e.id)).toContain('entry_global_approved');
      expect(eligible.map((e) => e.id)).toContain('entry_team_approved');
      expect(eligible.map((e) => e.id)).not.toContain('entry_pending');
      expect(eligible.map((e) => e.id)).not.toContain('entry_high_level');
      expect(eligible.map((e) => e.id)).not.toContain('entry_other_team');
    });
  });

  describe('governance filtering for v2 capsule strategy', () => {
    it('v2 capsule strategy would filter forbidden artifacts', () => {
      const routing = selectRetrievalStrategyV2('test query');
      expect(routing.selectedMode).toBe('local');
      expect(routing.routeFamily).toBe('capsule');

      // v2 uses isArtifactGovernanceEligible in capsule-recall.ts
      // which follows the same governance rules
      // This test verifies the v2 router produces the expected strategy
      // The actual artifact filtering is tested in capsule-recall.test.ts
    });
  });

  describe('selectedMode and channelsUsed trace metadata', () => {
    it('v1 router produces selectedMode for all strategies', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.selectedMode).toBeDefined();
        expect(typeof decision.selectedMode).toBe('string');
      }
    });

    it('v1 router produces channelsUsed (empty before recall)', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.channelsUsed).toBeDefined();
        expect(Array.isArray(decision.channelsUsed)).toBe(true);
        // channelsUsed is populated after recall execution
        expect(decision.channelsUsed).toEqual([]);
      }
    });

    it('v2 router produces selectedMode and channelsUsed', () => {
      const decision = selectRetrievalStrategyV2('test query');
      expect(decision.selectedMode).toBe('local');
      expect(decision.channelsUsed).toBeDefined();
      expect(Array.isArray(decision.channelsUsed)).toBe(true);
    });
  });
});
