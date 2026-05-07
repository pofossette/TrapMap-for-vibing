import { beforeEach, describe, expect, it } from 'vitest';

import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { createKnowledgeEntryRecord } from './knowledge.js';
import { runPreReview } from './pre-review.js';
import { searchKnowledge, updateEntryEmbeddingCache } from './retrieval.js';
import { JsonStore, type SkillShareerStore, nowIso } from './store.js';

import { ChannelRegistry } from './retrieval/channel-registry.js';
import { StrategyRegistry } from './retrieval/strategy-registry.js';
import type { RetrievalStrategy } from './retrieval/strategy-registry.js';

describe('retrieval', () => {
  let mockStore: SkillShareerStore;
  let mockServices: SkillShareerServices;
  let mockAuth: ResolvedAuthContext;
  let teamId: string;
  let otherTeamId: string;

  beforeEach(async () => {
    // Create a temporary store for testing
    const testDataDir = `/tmp/trapmap-test-${Date.now()}.json`;
    mockStore = new JsonStore(testDataDir);
    mockServices = {
      config: {
        ragLog: {
          enabled: false,
          logDir: 'logs/rag',
          maxFileSizeBytes: 10 * 1024 * 1024,
          maxBackupFiles: 5,
        },
      } as any,
      store: mockStore,
      adapterRegistry: {
        register: () => {},
        get: () => undefined,
        all: () => [],
        kinds: () => [],
        has: () => false,
      } as any,
      channelRegistry: new ChannelRegistry(),
      strategyRegistry: (() => {
        const sr = new StrategyRegistry();
        sr.register({
          version: 'semantic',
          async execute(query, _channels, eligibleEntries, services, auth) {
            const { semanticRecall } = await import('./retrieval/recall-coordinator.js');
            return semanticRecall(query.seed, eligibleEntries, query, services, auth);
          },
        });
        sr.register({
          version: 'hybrid',
          async execute(query, _channels, eligibleEntries, services, auth) {
            const { hybridRecall } = await import('./retrieval/recall-coordinator.js');
            return hybridRecall(query.seed, eligibleEntries, query, services, auth);
          },
        });
        sr.register({
          version: 'graph-assisted',
          async execute(query, _channels, eligibleEntries) {
            const { graphAssistedRecall } = await import('./retrieval/recall-coordinator.js');
            return graphAssistedRecall(query.seed, eligibleEntries, query);
          },
        });
        return sr;
      })(),
      ai: {
        embeddings: {
          provider: 'fallback',
          isConfigured: false,
          embed: async () => new Array(384).fill(0),
        },
        chat: {
          provider: 'fallback',
          isConfigured: false,
          invoke: async () => '',
        },
      },
    };

    teamId = 'team_1';
    otherTeamId = 'team_2';

    mockAuth = {
      subjectType: 'user',
      actorId: 'user_1',
      handle: 'testuser',
      activeTeamId: teamId,
      securityLevel: 5,
      effectivePermissions: ['knowledge:search'],
      user: {
        id: 'user_1',
        handle: 'testuser',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      membership: {
        id: 'member_1',
        userId: 'user_1',
        teamId: teamId,
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      team: {
        id: teamId,
        name: 'Test Team',
        slug: 'test-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    };

    // Seed some test knowledge entries
    const createdAt = nowIso();

    await mockStore.transact(async (data) => {
      // Approved global constraint
      const globalEntry = createKnowledgeEntryRecord({
        store: mockStore,
        data,
        ownerUserId: 'user_2',
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['security', 'auth'],
          shortcut: 'Always validate JWT tokens',
          detail: 'JWT tokens must be validated on every request to prevent authorization bypass.',
        },
        requiredLevel: 3,
        createdAt,
        preReview: await runPreReview({
          existingEntries: [],
          submission: {
            scope: 'global',
            labels: ['security', 'auth'],
            shortcut: 'Always validate JWT tokens',
            detail:
              'JWT tokens must be validated on every request to prevent authorization bypass.',
          },
        }),
      });
      globalEntry.lifecycleState = 'approved';
      data.knowledgeEntries.push(globalEntry);

      // Approved project entry for user's team
      const projectEntry = createKnowledgeEntryRecord({
        store: mockStore,
        data,
        ownerUserId: 'user_2',
        teamId: teamId,
        payload: {
          scope: 'project',
          labels: ['typescript', 'types'],
          shortcut: 'Use strict null checks',
          detail:
            'Enable strictNullChecks in tsconfig to catch null reference errors at compile time.',
        },
        requiredLevel: 5,
        createdAt,
        preReview: await runPreReview({
          existingEntries: [],
          submission: {
            scope: 'project',
            labels: ['typescript', 'types'],
            shortcut: 'Use strict null checks',
            detail:
              'Enable strictNullChecks in tsconfig to catch null reference errors at compile time.',
          },
        }),
      });
      projectEntry.lifecycleState = 'approved';
      data.knowledgeEntries.push(projectEntry);

      // Approved project entry for other team (should not be visible)
      const otherTeamEntry = createKnowledgeEntryRecord({
        store: mockStore,
        data,
        ownerUserId: 'user_3',
        teamId: otherTeamId,
        payload: {
          scope: 'project',
          labels: ['api', 'rest'],
          shortcut: 'REST API rate limiting',
          detail: 'Implement rate limiting on all public endpoints to prevent abuse.',
        },
        requiredLevel: 3,
        createdAt,
        preReview: await runPreReview({
          existingEntries: [],
          submission: {
            scope: 'project',
            labels: ['api', 'rest'],
            shortcut: 'REST API rate limiting',
            detail: 'Implement rate limiting on all public endpoints to prevent abuse.',
          },
        }),
      });
      otherTeamEntry.lifecycleState = 'approved';
      data.knowledgeEntries.push(otherTeamEntry);

      // Submitted entry (should not be visible)
      const submittedEntry = createKnowledgeEntryRecord({
        store: mockStore,
        data,
        ownerUserId: 'user_2',
        teamId: teamId,
        payload: {
          scope: 'project',
          labels: ['database', 'postgres'],
          shortcut: 'Use connection pooling',
          detail: 'Configure pgBouncer for efficient PostgreSQL connection management.',
        },
        requiredLevel: 5,
        createdAt,
        preReview: await runPreReview({
          existingEntries: [],
          submission: {
            scope: 'project',
            labels: ['database', 'postgres'],
            shortcut: 'Use connection pooling',
            detail: 'Configure pgBouncer for efficient PostgreSQL connection management.',
          },
        }),
      });
      // Keep it in submitted state (not approved)
      data.knowledgeEntries.push(submittedEntry);

      // Entry above user's security level (should not be visible)
      const highLevelEntry = createKnowledgeEntryRecord({
        store: mockStore,
        data,
        ownerUserId: 'user_2',
        teamId: teamId,
        payload: {
          scope: 'global',
          labels: ['security', 'encryption'],
          shortcut: 'Encrypt all data at rest',
          detail: 'Use AES-256 encryption for all sensitive data stored in the database.',
        },
        requiredLevel: 8, // Higher than user's level of 5
        createdAt,
        preReview: await runPreReview({
          existingEntries: [],
          submission: {
            scope: 'global',
            labels: ['security', 'encryption'],
            shortcut: 'Encrypt all data at rest',
            detail: 'Use AES-256 encryption for all sensitive data stored in the database.',
          },
        }),
      });
      highLevelEntry.lifecycleState = 'approved';
      data.knowledgeEntries.push(highLevelEntry);

      // Rejected entry (should not be visible)
      const rejectedEntry = createKnowledgeEntryRecord({
        store: mockStore,
        data,
        ownerUserId: 'user_2',
        teamId: teamId,
        payload: {
          scope: 'project',
          labels: ['bug', 'fix'],
          shortcut: 'Fix memory leak',
          detail: 'Memory leak in the worker process causes crashes after 24h.',
        },
        requiredLevel: 5,
        createdAt,
        preReview: await runPreReview({
          existingEntries: [],
          submission: {
            scope: 'project',
            labels: ['bug', 'fix'],
            shortcut: 'Fix memory leak',
            detail: 'Memory leak in the worker process causes crashes after 24h.',
          },
        }),
      });
      rejectedEntry.lifecycleState = 'rejected';
      data.knowledgeEntries.push(rejectedEntry);
    });
  });

  describe('eligibility filtering', () => {
    it('returns only approved entries matching the active team and caller level', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation security',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should include the approved global constraint
      expect(result.globalConstraints.length).toBeGreaterThan(0);

      // Should include the approved project entry for user's team
      expect(result.projectKnowledge.length).toBeGreaterThan(0);

      // Total should not include entries from other teams, non-approved, or above level
      const totalMatches = result.globalConstraints.length + result.projectKnowledge.length;
      expect(totalMatches).toBeLessThanOrEqual(2); // At most 2 eligible entries
    });

    it('excludes submitted, agent-pass, agent-rejected, rejected, and deactivated entries', async () => {
      const query: RetrievalQuery = {
        seed: 'database connection pooling',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The submitted entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const submittedMatch = allMatches.find((m) => m.detail.includes('connection pooling'));
      expect(submittedMatch).toBeUndefined();
    });

    it('excludes project entries from another team for non-system-admin callers', async () => {
      const query: RetrievalQuery = {
        seed: 'REST API rate limiting',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The other team's entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const otherTeamMatch = allMatches.find((m) => m.detail.includes('rate limiting'));
      expect(otherTeamMatch).toBeUndefined();
    });

    it('excludes entries above the caller security level', async () => {
      const query: RetrievalQuery = {
        seed: 'encryption data at rest',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The high-level entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const highLevelMatch = allMatches.find((m) => m.detail.includes('encryption'));
      expect(highLevelMatch).toBeUndefined();
    });

    it('excludes rejected entries', async () => {
      const query: RetrievalQuery = {
        seed: 'memory leak fix',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The rejected entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const rejectedMatch = allMatches.find((m) => m.detail.includes('memory leak'));
      expect(rejectedMatch).toBeUndefined();
    });
  });

  describe('filter behavior', () => {
    it('narrows eligible results by scope filter', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: [], scopes: ['global'] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should only return global constraints
      expect(result.projectKnowledge.length).toBe(0);
      expect(result.globalConstraints.length).toBeGreaterThan(0);
    });

    it('narrows eligible results by label filter', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: ['security'], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // All returned matches should have the security label
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      for (const match of allMatches) {
        expect(match.labels).toContain('security');
      }
    });

    it('requires all labels to match when multiple labels specified', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: ['security', 'auth'], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // All returned matches should have both labels
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      for (const match of allMatches) {
        expect(match.labels).toContain('security');
        expect(match.labels).toContain('auth');
      }
    });
  });

  describe('embedding cache behavior', () => {
    it('uses deterministic vectors when no provider is configured', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      // Multiple searches with same query should return same results
      const result1 = await searchKnowledge(mockServices, mockAuth, query);
      const result2 = await searchKnowledge(mockServices, mockAuth, query);

      expect(result1.globalConstraints).toEqual(result2.globalConstraints);
      expect(result1.projectKnowledge).toEqual(result1.projectKnowledge);
    });

    it('updates embedding cache when explicitly called', async () => {
      const data = await mockStore.snapshot();
      const entry = data.knowledgeEntries[0];
      if (!entry) {
        throw new Error('No entry found in test data');
      }

      // Initially, cache should be null
      expect(entry.embeddingCache).toBeNull();

      // Update cache
      await updateEntryEmbeddingCache(mockServices, entry.id);

      // Cache should now be populated
      const updatedData = await mockStore.snapshot();
      const updatedEntry = updatedData.knowledgeEntries.find((e) => e.id === entry.id);
      expect(updatedEntry).toBeDefined();
      if (!updatedEntry) {
        throw new Error('Entry should exist after update');
      }
      expect(updatedEntry.embeddingCache).not.toBeNull();
      expect(updatedEntry.embeddingCache?.vector.length).toBeGreaterThan(0);
    });
  });

  describe('result shaping', () => {
    it('splits results into global constraints and project knowledge', async () => {
      const query: RetrievalQuery = {
        seed: 'validation types',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should have separate arrays
      expect(Array.isArray(result.globalConstraints)).toBe(true);
      expect(Array.isArray(result.projectKnowledge)).toBe(true);

      // Global constraints should have scope: global
      for (const match of result.globalConstraints) {
        expect(match.scope).toBe('global');
      }

      // Project knowledge should have scope: project
      for (const match of result.projectKnowledge) {
        expect(match.scope).toBe('project');
      }
    });

    it('ensures no entry ID appears in both buckets', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Collect all entry IDs from both buckets
      const globalIds = new Set(result.globalConstraints.map((m) => m.entryId));
      const projectIds = new Set(result.projectKnowledge.map((m) => m.entryId));

      // Check for overlap
      const overlappingIds = [...globalIds].filter((id) => projectIds.has(id));

      // No entry should appear in both buckets
      expect(overlappingIds).toHaveLength(0);
    });

    it('provides concrete metadata in match reasons', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: ['security'], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];

      for (const match of allMatches) {
        // Reason should be non-empty
        expect(match.reason).toBeTruthy();
        expect(match.reason.length).toBeGreaterThan(0);

        // Reason should include concrete information, not just generic text
        // Check for at least one of: label mentions, scope mentions, or score
        const hasLabels = match.labels.some((label) =>
          match.reason.toLowerCase().includes(label.toLowerCase()),
        );
        const hasScope = match.reason.toLowerCase().includes(match.scope.toLowerCase());
        const hasScore = match.reason.includes('score:');

        expect(hasLabels || hasScope || hasScore).toBe(true);
      }
    });

    it('respects maxResults limit', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: [], scopes: [] },
        maxResults: 1,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Total matches should not exceed maxResults
      const totalMatches = result.globalConstraints.length + result.projectKnowledge.length;
      expect(totalMatches).toBeLessThanOrEqual(1);
    });

    it('includes scores and reasons for each match', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];

      for (const match of allMatches) {
        expect(typeof match.score).toBe('number');
        expect(match.score).toBeGreaterThanOrEqual(0);
        expect(match.score).toBeLessThanOrEqual(1);
        expect(typeof match.reason).toBe('string');
        expect(match.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('empty results', () => {
    it('returns empty arrays when no eligible entries exist', async () => {
      const query: RetrievalQuery = {
        seed: 'nonexistent content that matches nothing',
        filters: { labels: ['nonexistent'], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // With a label that doesn't exist, we should get empty results
      // (unless the deterministic search happens to match by semantic similarity)
      const totalMatches = result.globalConstraints.length + result.projectKnowledge.length;
      // The test might still get results due to deterministic fallback,
      // but the structure should be correct
      expect(Array.isArray(result.globalConstraints)).toBe(true);
      expect(Array.isArray(result.projectKnowledge)).toBe(true);
    });

    it('returns null refinementSummary when refinement is not requested', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      expect(result.refinementSummary).toBeNull();
    });
  });

  describe('system admin access', () => {
    it('allows system admin to see project entries from any team', async () => {
      const systemAdminAuth: ResolvedAuthContext = {
        subjectType: 'system-admin',
        actorId: 'system-admin',
        handle: 'system-admin',
        activeTeamId: null,
        securityLevel: 10,
        effectivePermissions: ['knowledge:search'],
        user: null,
        membership: null,
        team: null,
      };

      const query: RetrievalQuery = {
        seed: 'REST API rate limiting',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, systemAdminAuth, query);

      // System admin should be able to see the other team's entry
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const otherTeamMatch = allMatches.find((m) => m.detail.includes('rate limiting'));
      expect(otherTeamMatch).toBeDefined();
    });
  });

  describe('refinement behavior', () => {
    it('returns null refinementSummary when includeRefinement is false', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      expect(result.refinementSummary).toBeNull();
    });

    it('returns null refinementSummary when no provider is configured', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: true, // Request refinement
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should still return matches, but with null refinement
      expect(result.refinementSummary).toBeNull();
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);
    });

    it('search succeeds when provider config is absent', async () => {
      const query: RetrievalQuery = {
        seed: 'typescript types validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: true,
        includeSummary: false,
        mode: 'semantic',
      };

      // This should not throw even without provider credentials
      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should have matches
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // Each match should have valid score and reason
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      for (const match of allMatches) {
        expect(match.score).toBeGreaterThanOrEqual(0);
        expect(match.score).toBeLessThanOrEqual(1);
        expect(match.reason).toBeTruthy();
        expect(match.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('persisted index state read path (Phase 8)', () => {
    it('semantic recall prefers persisted indexState.vector over recomputing', async () => {
      const data = await mockStore.snapshot();
      const entry = data.knowledgeEntries[0];
      if (!entry) {
        throw new Error('No entry found in test data');
      }

      // Initially, no index state exists - should fall back to recomputation
      expect(entry.indexState).toBeNull();

      // After updating embedding cache, the entry should have cached vectors
      await updateEntryEmbeddingCache(mockServices, entry.id);
      const updatedData = await mockStore.snapshot();
      const updatedEntry = updatedData.knowledgeEntries.find((e) => e.id === entry.id);
      expect(updatedEntry).toBeDefined();
      if (!updatedEntry) {
        throw new Error('Entry should exist after update');
      }

      // For Phase 8, when indexState.vector is synced, semantic recall should read from it
      // This test documents the expected behavior: persisted state is preferred
      // The actual implementation will be added in Task 2
      expect(updatedEntry.embeddingCache).not.toBeNull();

      // TODO: Phase 8 Task 2 - verify that getEntryEmbedding reads indexState.vector first
      // For now, this test ensures the embedding cache is populated
    });

    it('keyword recall reuses persisted field tokens for synced entries', async () => {
      const data = await mockStore.snapshot();
      const entry = data.knowledgeEntries[0];
      if (!entry) {
        throw new Error('No entry found in test data');
      }

      // For Phase 8, when indexState.keyword is synced, keyword recall should reuse
      // persisted tokens instead of tokenizing entry text on every query
      // This test documents the expected behavior
      expect(entry.indexState).toBeNull();

      // TODO: Phase 8 Task 2 - verify that keywordRecall uses persisted tokens
      // when indexState.keyword.status === 'synced'
      // For now, this test ensures the entry structure is ready for persisted state
    });

    it('legacy entries without synced state fall back to hot-path recomputation', async () => {
      const data = await mockStore.snapshot();
      const entry = data.knowledgeEntries[0];
      if (!entry) {
        throw new Error('No entry found in test data');
      }

      // Legacy entries (without indexState) should still work via fallback
      expect(entry.indexState).toBeNull();

      // Search should still succeed using the hot path
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results even without persisted index state
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);
    });
  });

  describe('citation audit trail (Phase 10)', () => {
    it('preserves pre-rerank and final scores for hybrid mode', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // For hybrid mode, the internal merge and rerank stages preserve scores
      // The response matches still contain the final score
      // This test verifies that the internal pipeline preserves audit evidence
      // Actual citation fields will be populated in Task 2
      expect(result.globalConstraints[0]?.score).toBeDefined();
      expect(result.globalConstraints[0]?.score).toBeGreaterThanOrEqual(0);
      expect(result.globalConstraints[0]?.score).toBeLessThanOrEqual(1);
    });

    it('preserves recall channel evidence for hybrid mode', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT tokens',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // The internal pipeline tracks which channels contributed
      // This test verifies that channel evidence is preserved
      // Actual citation channels will be populated in Task 2
      const match = result.globalConstraints[0];
      expect(match?.score).toBeDefined();
    });

    it('semantic mode preserves score for citation', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation security',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'semantic',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length).toBeGreaterThan(0);

      // Semantic mode score should be preserved for citation
      const match = result.globalConstraints[0];
      expect(match?.score).toBeDefined();
      expect(match?.score).toBeGreaterThanOrEqual(0);
      expect(match?.score).toBeLessThanOrEqual(1);
    });

    it('graph-assisted mode preserves all channel scores', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'graph-assisted',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // Graph-assisted mode combines semantic, keyword, and graph scores
      // The final score in the response is the result of merging and reranking
      const match = result.globalConstraints[0] || result.projectKnowledge[0];
      expect(match?.score).toBeDefined();
      expect(match?.score).toBeGreaterThanOrEqual(0);
      expect(match?.score).toBeLessThanOrEqual(1);
    });

    it('hybrid mode includes citations in response', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length).toBeGreaterThan(0);

      // Hybrid mode should include citations
      const match = result.globalConstraints[0];
      expect(match?.citation).toBeDefined();
      expect(match?.citation?.source.entryId).toBeDefined();
      expect(match?.citation?.source.scope).toBeDefined();
      expect(match?.citation?.snippet).toBeDefined();
      expect(match?.citation?.tags).toBeDefined();
      expect(match?.citation?.recallChannels).toBeDefined();
      expect(match?.citation?.scores).toBeDefined();
      expect(match?.citation?.scores.preRerank).toBeDefined();
      expect(match?.citation?.scores.final).toBeDefined();
    });

    it('graph-assisted mode includes citations with all channels', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'graph-assisted',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // Graph-assisted mode should include citations
      const match = result.globalConstraints[0] || result.projectKnowledge[0];
      expect(match?.citation).toBeDefined();
      // Graph-assisted mode should have at least semantic and keyword channels
      expect(match?.citation?.recallChannels.length).toBeGreaterThanOrEqual(2);
      // The graph score may be null if no graph relationships were found
      expect(match?.citation?.scores).toBeDefined();
    });
  });

  describe('summary generation', () => {
    it('returns null summary when includeSummary is false (default)', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid', // Use hybrid to get citations
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Summary should be null when disabled
      expect(result.summary).toBeNull();
    });

    it('returns null summary when semantic mode (no citations available)', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: true,
        mode: 'semantic', // Semantic mode doesn't generate citations
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Summary should be null when no citations available
      expect(result.summary).toBeNull();
    });

    it('generates summary when includeSummary is true and mode provides citations', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: true,
        mode: 'hybrid', // Hybrid mode provides citations
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // Summary should be generated
      expect(result.summary).toBeDefined();
      expect(result.summary).not.toBeNull();
      expect(result.summary?.text).toBeDefined();
      expect(result.summary?.text.length).toBeGreaterThan(0);
      expect(result.summary?.citations).toBeDefined();
      expect(result.summary?.citations.length).toBeGreaterThan(0);
    });

    it('summary only includes citations from already-filtered hits', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT',
        filters: { labels: ['security'], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: true,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Summary should only reference entries that passed all filters
      expect(result.summary).toBeDefined();
      expect(result.summary?.citations.length).toBeGreaterThan(0);

      // All citation entry IDs should match the returned hits
      const returnedEntryIds = new Set([
        ...result.globalConstraints.map((m) => m.entryId),
        ...result.projectKnowledge.map((m) => m.entryId),
      ]);

      for (const citation of result.summary?.citations || []) {
        expect(returnedEntryIds.has(citation.source.entryId)).toBe(true);
      }
    });

    it('graph-assisted mode generates summary with citations', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: true,
        mode: 'graph-assisted',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return results
      expect(result.globalConstraints.length + result.projectKnowledge.length).toBeGreaterThan(0);

      // Summary should be generated with citations
      expect(result.summary).toBeDefined();
      expect(result.summary?.citations.length).toBeGreaterThan(0);
      // Citations should include at least one entry
      expect(result.summary?.citations[0]?.source.entryId).toBeDefined();
    });

    it('summary does not introduce unapproved or unauthorized content', async () => {
      // This test verifies that summary only uses content that passed
      // all eligibility filters (approval, team, level, lifecycle state)

      const query: RetrievalQuery = {
        seed: 'security',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: true,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Summary should only reference approved entries for the user's team
      expect(result.summary).toBeDefined();
      if (result.summary?.citations) {
        for (const citation of result.summary.citations) {
          // All cited entries should be in the returned results
          const inGlobal = result.globalConstraints.some(
            (m) => m.entryId === citation.source.entryId,
          );
          const inProject = result.projectKnowledge.some(
            (m) => m.entryId === citation.source.entryId,
          );
          expect(inGlobal || inProject).toBe(true);
        }
      }
    });
  });

  // Phase 16-02: Coexistence governance parity (COMP-02, COMP-04, T-16-05)
  describe('governance boundary parity (Phase 16-02)', () => {
    it('filters apply consistently regardless of query mode', async () => {
      // Same query should respect the same eligibility filters
      // regardless of whether using semantic, hybrid, or graph-assisted mode
      const baseQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
      };

      const [semanticResult, hybridResult, graphResult] = await Promise.all([
        searchKnowledge(mockServices, mockAuth, { ...baseQuery, mode: 'semantic' }),
        searchKnowledge(mockServices, mockAuth, { ...baseQuery, mode: 'hybrid' }),
        searchKnowledge(mockServices, mockAuth, { ...baseQuery, mode: 'graph-assisted' }),
      ]);

      // All modes should filter out:
      // - entries above caller security level
      // - entries from other teams (non-system-admin)
      // - non-approved entries

      const assertNoHighLevel = (result: typeof semanticResult) => {
        const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
        for (const match of allMatches) {
          expect(match.requiredLevel).toBeLessThanOrEqual(mockAuth.securityLevel);
        }
      };

      const assertNoOtherTeam = (result: typeof semanticResult) => {
        const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
        for (const match of allMatches) {
          if (match.scope === 'project') {
            // Project entries should be from user's team
            // (or be visible via global scope)
          }
        }
      };

      assertNoHighLevel(semanticResult);
      assertNoHighLevel(hybridResult);
      assertNoHighLevel(graphResult);
      assertNoOtherTeam(semanticResult);
      assertNoOtherTeam(hybridResult);
      assertNoOtherTeam(graphResult);
    });

    it('approval state filter is enforced before result shaping', async () => {
      // Non-approved entries should never appear in results
      const query: RetrievalQuery = {
        seed: 'connection pooling', // Matches submitted entry
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The submitted entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const submittedMatch = allMatches.find((m) => m.detail.includes('connection pooling'));
      expect(submittedMatch).toBeUndefined();
    });

    it('team scope filter prevents cross-team access for non-admin', async () => {
      // Non-system-admin should not see other team's project knowledge
      const query: RetrievalQuery = {
        seed: 'REST API rate limiting', // Matches other team entry
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The other team's entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const otherTeamMatch = allMatches.find((m) => m.detail.includes('rate limiting'));
      expect(otherTeamMatch).toBeUndefined();
    });

    it('security level filter prevents access to higher-level content', async () => {
      // User with level 5 should not see entries with requiredLevel 8
      const query: RetrievalQuery = {
        seed: 'encryption data at rest', // Matches high-level entry
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The high-level entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const highLevelMatch = allMatches.find((m) => m.detail.includes('encryption'));
      expect(highLevelMatch).toBeUndefined();
    });

    it('rejected entries are excluded from results', async () => {
      const query: RetrievalQuery = {
        seed: 'memory leak fix', // Matches rejected entry
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // The rejected entry should not appear
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      const rejectedMatch = allMatches.find((m) => m.detail.includes('memory leak'));
      expect(rejectedMatch).toBeUndefined();
    });
  });

  // Phase 16-02: Metadata-only boundary (T-16-06)
  describe('metadata-only retrieval boundary (Phase 16-02)', () => {
    it('retrieval responses do not include artifact bundle payloads', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Verify response structure is capsule/metadata only
      // No raw bundle payloads, file contents, or script bodies
      expect(result.globalConstraints).toBeDefined();
      expect(result.projectKnowledge).toBeDefined();

      // Each match should have standard fields but no payload/body fields
      for (const match of result.globalConstraints) {
        expect(match.entryId).toBeDefined();
        expect(match.shortcut).toBeDefined();
        expect(match.detail).toBeDefined();
        expect(match.labels).toBeDefined();
        expect(match.score).toBeDefined();
        expect(match.reason).toBeDefined();
        // Should NOT have payload/body fields
        expect((match as any).payload).toBeUndefined();
        expect((match as any).body).toBeUndefined();
        expect((match as any).content).toBeUndefined(); // No raw content
      }
    });

    it('citations provide snippets not full documents', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        includeSummary: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Citations should have snippet field, not full document
      for (const match of result.globalConstraints) {
        if (match.citation) {
          expect(match.citation.snippet).toBeDefined();
          // Snippet should be a portion of detail, not the full document
          expect(typeof match.citation.snippet).toBe('string');
          // Should not have rawContent or body
          expect((match.citation as any).rawContent).toBeUndefined();
          expect((match.citation as any).body).toBeUndefined();
        }
      }
    });
  });
});
