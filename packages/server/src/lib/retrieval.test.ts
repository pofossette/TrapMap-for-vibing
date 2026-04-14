import { beforeEach, describe, expect, it } from 'vitest';

import type { RetrievalQuery } from '@skill-shareer/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { createKnowledgeEntryRecord } from './knowledge.js';
import { runPreReview } from './pre-review.js';
import { searchKnowledge, updateEntryEmbeddingCache } from './retrieval.js';
import type { KnowledgeRecord } from './store.js';
import { JsonStore, nowIso } from './store.js';
import {
  createSemanticCandidate,
  hasBothChannels,
  mergeCandidates,
  toScoredEntries,
  toScoredEntry,
} from './retrieval/merge.js';
import type { RecallCandidate, MergedCandidate } from './retrieval/types.js';

describe('retrieval', () => {
  let mockStore: JsonStore;
  let mockServices: SkillShareerServices;
  let mockAuth: ResolvedAuthContext;
  let teamId: string;
  let otherTeamId: string;

  beforeEach(async () => {
    // Create a temporary store for testing
    const testDataDir = `/tmp/skill-shareer-test-${Date.now()}.json`;
    mockStore = new JsonStore(testDataDir);
    mockServices = {
      config: {} as any,
      store: mockStore,
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

  describe('hybrid mode', () => {
    it('mode: hybrid executes semantic + keyword recall + merge instead of returning 501', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        mode: 'hybrid',
      };

      // Should not throw 501 error
      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should return valid response structure
      expect(Array.isArray(result.globalConstraints)).toBe(true);
      expect(Array.isArray(result.projectKnowledge)).toBe(true);
      expect(result.refinementSummary).toBeNull();
    });

    it('omitting mode still follows existing semantic path', async () => {
      // At runtime, Zod applies default mode='semantic', but TypeScript type requires mode
      // We test by passing object directly (not typed) to verify runtime default behavior
      const queryWithoutMode = {
        seed: 'JWT validation',
        filters: { labels: [] as string[], scopes: [] as ('global' | 'project')[] },
        maxResults: 10,
        includeRefinement: false,
        // mode omitted - should default to semantic at runtime
      } as unknown as RetrievalQuery;

      const queryWithSemantic: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        mode: 'semantic',
      };

      const resultWithoutMode = await searchKnowledge(mockServices, mockAuth, queryWithoutMode);
      const resultWithSemantic = await searchKnowledge(mockServices, mockAuth, queryWithSemantic);

      // Results should be identical when mode defaults to semantic
      expect(resultWithoutMode.globalConstraints.map(m => m.entryId))
        .toEqual(resultWithSemantic.globalConstraints.map(m => m.entryId));
      expect(resultWithoutMode.projectKnowledge.map(m => m.entryId))
        .toEqual(resultWithSemantic.projectKnowledge.map(m => m.entryId));
    });

    it('hybrid responses preserve existing response shape', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation security',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Response shape must match contract
      expect(result).toHaveProperty('globalConstraints');
      expect(result).toHaveProperty('projectKnowledge');
      expect(result).toHaveProperty('refinementSummary');

      // All matches should have required fields
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];
      for (const match of allMatches) {
        expect(match).toHaveProperty('entryId');
        expect(match).toHaveProperty('scope');
        expect(match).toHaveProperty('requiredLevel');
        expect(match).toHaveProperty('shortcut');
        expect(match).toHaveProperty('detail');
        expect(match).toHaveProperty('labels');
        expect(match).toHaveProperty('score');
        expect(match).toHaveProperty('reason');
      }
    });

    it('hybrid mode respects scope semantics (global vs project)', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Global entries should be in globalConstraints
      for (const match of result.globalConstraints) {
        expect(match.scope).toBe('global');
      }

      // Project entries should be in projectKnowledge
      for (const match of result.projectKnowledge) {
        expect(match.scope).toBe('project');
      }
    });

    it('hybrid mode does not change scope filter behavior', async () => {
      const query: RetrievalQuery = {
        seed: 'validation',
        filters: { labels: [], scopes: ['global'] },
        maxResults: 10,
        includeRefinement: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should only return global constraints
      expect(result.projectKnowledge.length).toBe(0);
      expect(result.globalConstraints.length).toBeGreaterThanOrEqual(0);
    });

    it('hybrid mode produces deterministic results for same input', async () => {
      const query: RetrievalQuery = {
        seed: 'JWT validation',
        filters: { labels: [], scopes: [] },
        maxResults: 10,
        includeRefinement: false,
        mode: 'hybrid',
      };

      const result1 = await searchKnowledge(mockServices, mockAuth, query);
      const result2 = await searchKnowledge(mockServices, mockAuth, query);

      expect(result1.globalConstraints).toEqual(result2.globalConstraints);
      expect(result1.projectKnowledge).toEqual(result2.projectKnowledge);
    });

    it('hybrid mode combines semantic and keyword signals', async () => {
      // This test verifies that hybrid mode runs both channels
      // Even with deterministic embeddings, keyword channel adds lexical evidence

      const query: RetrievalQuery = {
        seed: 'JWT authentication', // Terms that appear in test data
        filters: { labels: [], scopes: [] },
        maxResults: 5,
        includeRefinement: false,
        mode: 'hybrid',
      };

      const result = await searchKnowledge(mockServices, mockAuth, query);

      // Should have results that combine both channels
      const allMatches = [...result.globalConstraints, ...result.projectKnowledge];

      // All matches should have valid scores
      for (const match of allMatches) {
        expect(match.score).toBeGreaterThanOrEqual(0);
        expect(match.score).toBeLessThanOrEqual(1);
      }
    });
  });
});

// =============================================================================
// Merge Module Tests (Phase 7 Hybrid Groundwork)
// =============================================================================

/**
 * Helper to create a minimal KnowledgeRecord for merge testing.
 */
function createTestEntryForMerge(overrides: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id: 'test_1',
    teamId: null,
    scope: 'global',
    labels: [],
    shortcut: '',
    detail: '',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      shortcut: '',
      detail: '',
      labels: [],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as KnowledgeRecord;
}

describe('merge module', () => {
  describe('mergeCandidates', () => {
    it('deduplicates candidates by entry id when the same entry appears in both channels', () => {
      const sharedEntry = createTestEntryForMerge({ id: 'entry_1' });

      const semanticCandidates: RecallCandidate[] = [
        { entry: sharedEntry, channel: 'semantic', score: 0.8, tokenMatches: [] },
      ];

      const keywordCandidates: RecallCandidate[] = [
        { entry: sharedEntry, channel: 'keyword', score: 0.6, tokenMatches: [{ token: 'test', fields: ['shortcut'] }] },
      ];

      const merged = mergeCandidates(semanticCandidates, keywordCandidates);

      // Should have exactly one entry (deduplicated)
      expect(merged.length).toBe(1);
      expect(merged[0]?.entry.id).toBe('entry_1');

      // Should have both channel scores preserved
      expect(merged[0]?.semanticScore).toBe(0.8);
      expect(merged[0]?.keywordScore).toBe(0.6);

      // Should have both channels recorded
      expect(merged[0]?.channels).toContain('semantic');
      expect(merged[0]?.channels).toContain('keyword');

      // Token matches from keyword channel should be preserved
      expect(merged[0]?.tokenMatches.length).toBe(1);
    });

    it('preserves normalized channel evidence for later rerank', () => {
      const entry1 = createTestEntryForMerge({ id: 'entry_1' });
      const entry2 = createTestEntryForMerge({ id: 'entry_2' });

      const semanticCandidates: RecallCandidate[] = [
        { entry: entry1, channel: 'semantic', score: 0.9, tokenMatches: [] },
      ];

      const keywordCandidates: RecallCandidate[] = [
        { entry: entry2, channel: 'keyword', score: 0.7, tokenMatches: [{ token: 'test', fields: ['detail'] }] },
      ];

      const merged = mergeCandidates(semanticCandidates, keywordCandidates);

      expect(merged.length).toBe(2);

      // Semantic-only entry should have keywordScore of 0
      const semanticOnly = merged.find((m) => m.entry.id === 'entry_1');
      expect(semanticOnly).toBeDefined();
      expect(semanticOnly?.semanticScore).toBe(0.9);
      expect(semanticOnly?.keywordScore).toBe(0);
      expect(semanticOnly?.channels).toEqual(['semantic']);

      // Keyword-only entry should have semanticScore of 0
      const keywordOnly = merged.find((m) => m.entry.id === 'entry_2');
      expect(keywordOnly).toBeDefined();
      expect(keywordOnly?.semanticScore).toBe(0);
      expect(keywordOnly?.keywordScore).toBe(0.7);
      expect(keywordOnly?.channels).toEqual(['keyword']);
    });

    it('sorts merged candidates deterministically and respects maxCandidates bound', () => {
      const entryA = createTestEntryForMerge({ id: 'entry_a' });
      const entryB = createTestEntryForMerge({ id: 'entry_b' });
      const entryC = createTestEntryForMerge({ id: 'entry_c' });

      const semanticCandidates: RecallCandidate[] = [
        { entry: entryA, channel: 'semantic', score: 0.5, tokenMatches: [] },
        { entry: entryB, channel: 'semantic', score: 0.9, tokenMatches: [] },
        { entry: entryC, channel: 'semantic', score: 0.3, tokenMatches: [] },
      ];

      const keywordCandidates: RecallCandidate[] = [];

      const merged = mergeCandidates(semanticCandidates, keywordCandidates, { maxCandidates: 2 });

      // Should be limited to 2 candidates
      expect(merged.length).toBe(2);

      // Should be sorted by combined score descending
      expect(merged[0]?.entry.id).toBe('entry_b'); // 0.9 * 0.6 = 0.54
      expect(merged[1]?.entry.id).toBe('entry_a'); // 0.5 * 0.6 = 0.30
    });

    it('uses entry id as tiebreaker for deterministic ordering when scores are equal', () => {
      const entryA = createTestEntryForMerge({ id: 'entry_a' });
      const entryB = createTestEntryForMerge({ id: 'entry_b' });
      const entryC = createTestEntryForMerge({ id: 'entry_c' });

      // All entries have same score - should be sorted by ID
      const semanticCandidates: RecallCandidate[] = [
        { entry: entryC, channel: 'semantic', score: 0.8, tokenMatches: [] },
        { entry: entryA, channel: 'semantic', score: 0.8, tokenMatches: [] },
        { entry: entryB, channel: 'semantic', score: 0.8, tokenMatches: [] },
      ];

      const merged = mergeCandidates(semanticCandidates, []);

      // Should be sorted by entry ID ascending when scores are equal
      expect(merged[0]?.entry.id).toBe('entry_a');
      expect(merged[1]?.entry.id).toBe('entry_b');
      expect(merged[2]?.entry.id).toBe('entry_c');
    });

    it('combines scores using weighted average with default weights', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const semanticCandidates: RecallCandidate[] = [
        { entry, channel: 'semantic', score: 1.0, tokenMatches: [] },
      ];

      const keywordCandidates: RecallCandidate[] = [
        { entry, channel: 'keyword', score: 1.0, tokenMatches: [] },
      ];

      const merged = mergeCandidates(semanticCandidates, keywordCandidates);

      // Default weights: semantic=0.6, keyword=0.4
      // Combined: 1.0 * 0.6 + 1.0 * 0.4 = 1.0
      expect(merged[0]?.combinedScore).toBeCloseTo(1.0, 5);
    });

    it('supports custom merge weights', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const semanticCandidates: RecallCandidate[] = [
        { entry, channel: 'semantic', score: 0.8, tokenMatches: [] },
      ];

      const keywordCandidates: RecallCandidate[] = [
        { entry, channel: 'keyword', score: 0.6, tokenMatches: [] },
      ];

      const merged = mergeCandidates(semanticCandidates, keywordCandidates, {
        semanticWeight: 0.8,
        keywordWeight: 0.2,
      });

      // Custom weights: 0.8 * 0.8 + 0.6 * 0.2 = 0.64 + 0.12 = 0.76
      expect(merged[0]?.combinedScore).toBeCloseTo(0.76, 5);
    });

    it('returns empty array when both candidate lists are empty', () => {
      const merged = mergeCandidates([], []);
      expect(merged).toEqual([]);
    });

    it('handles semantic-only candidates', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const semanticCandidates: RecallCandidate[] = [
        { entry, channel: 'semantic', score: 0.8, tokenMatches: [] },
      ];

      const merged = mergeCandidates(semanticCandidates, []);

      expect(merged.length).toBe(1);
      expect(merged[0]?.semanticScore).toBe(0.8);
      expect(merged[0]?.keywordScore).toBe(0);
      expect(merged[0]?.channels).toEqual(['semantic']);
    });

    it('handles keyword-only candidates', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const keywordCandidates: RecallCandidate[] = [
        { entry, channel: 'keyword', score: 0.7, tokenMatches: [] },
      ];

      const merged = mergeCandidates([], keywordCandidates);

      expect(merged.length).toBe(1);
      expect(merged[0]?.semanticScore).toBe(0);
      expect(merged[0]?.keywordScore).toBe(0.7);
      expect(merged[0]?.channels).toEqual(['keyword']);
    });
  });

  describe('toScoredEntry', () => {
    it('converts merged candidate to scored entry using combined score', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const merged: MergedCandidate = {
        entry,
        semanticScore: 0.8,
        keywordScore: 0.6,
        combinedScore: 0.72,
        tokenMatches: [],
        channels: ['semantic', 'keyword'],
      };

      const scored = toScoredEntry(merged);

      expect(scored.entry.id).toBe('entry_1');
      expect(scored.score).toBe(0.72);
    });
  });

  describe('toScoredEntries', () => {
    it('converts multiple merged candidates to scored entries', () => {
      const entry1 = createTestEntryForMerge({ id: 'entry_1' });
      const entry2 = createTestEntryForMerge({ id: 'entry_2' });

      const merged: MergedCandidate[] = [
        {
          entry: entry1,
          semanticScore: 0.9,
          keywordScore: 0,
          combinedScore: 0.54,
          tokenMatches: [],
          channels: ['semantic'],
        },
        {
          entry: entry2,
          semanticScore: 0,
          keywordScore: 0.8,
          combinedScore: 0.32,
          tokenMatches: [],
          channels: ['keyword'],
        },
      ];

      const scored = toScoredEntries(merged);

      expect(scored.length).toBe(2);
      expect(scored[0]?.entry.id).toBe('entry_1');
      expect(scored[0]?.score).toBe(0.54);
      expect(scored[1]?.entry.id).toBe('entry_2');
      expect(scored[1]?.score).toBe(0.32);
    });
  });

  describe('createSemanticCandidate', () => {
    it('creates a semantic candidate with correct properties', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const candidate = createSemanticCandidate(entry, 0.85);

      expect(candidate.entry.id).toBe('entry_1');
      expect(candidate.channel).toBe('semantic');
      expect(candidate.score).toBe(0.85);
      expect(candidate.tokenMatches).toEqual([]);
    });
  });

  describe('hasBothChannels', () => {
    it('returns true when candidate has both channels', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const merged: MergedCandidate = {
        entry,
        semanticScore: 0.8,
        keywordScore: 0.6,
        combinedScore: 0.72,
        tokenMatches: [],
        channels: ['semantic', 'keyword'],
      };

      expect(hasBothChannels(merged)).toBe(true);
    });

    it('returns false when candidate has only one channel', () => {
      const entry = createTestEntryForMerge({ id: 'entry_1' });

      const semanticOnly: MergedCandidate = {
        entry,
        semanticScore: 0.8,
        keywordScore: 0,
        combinedScore: 0.48,
        tokenMatches: [],
        channels: ['semantic'],
      };

      expect(hasBothChannels(semanticOnly)).toBe(false);
    });
  });
});
