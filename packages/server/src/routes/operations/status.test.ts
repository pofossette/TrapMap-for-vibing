import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import {
  createCacheInvalidationEvent,
  emitCacheInvalidation,
  resetCacheFreshnessForTests,
} from '@trapmap/server/lib/cache/invalidation.js';
import {
  getCachedQueryEmbedding,
  resetQueryEmbeddingCacheForTests,
  setCachedQueryEmbedding,
} from '@trapmap/server/lib/cache/query-embedding-cache.js';
import {
  getCachedRetrievalReadModel,
  resetRetrievalReadModelCacheForTests,
  setCachedRetrievalReadModel,
} from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import { clearRetrievalCacheRegistry } from '@trapmap/server/lib/cache/retrieval-cache.js';
import { InMemoryIntentCache } from '@trapmap/server/lib/retrieval/capsules/intent-cache.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('compatibility status route (Phase 16-01)', () => {
    it('returns 401 for unauthenticated status request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/status',
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts valid status request schema', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/status',
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts team ID filter parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/status?teamId=team_1',
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });

  // Phase 16-03: Sunset readiness criteria and status report verification (COMP-03, COMP-04)
  describe('compatibility status sunset readiness (Phase 16-03)', () => {
    let testApp: FastifyInstance;
    let testStore: SkillShareerStore;
    let sessionId: string;
    const userId = 'user_sunset_test';

    beforeEach(async () => {
      const testDataFile = `/tmp/trapmap-test-sunset-${Date.now()}-${Math.random()}.json`;

      testApp = buildServer({ config: { dataFile: testDataFile } });
      await testApp.ready();
      testStore = testApp.skillShareer.store;

      await testStore.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        // Create user
        data.users.push({
          id: userId,
          handle: 'sunsetuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create membership with export permission
        data.memberships.push({
          id: 'membership_sunset',
          userId,
          teamId: null,
          roleTemplate: 'admin',
          securityLevel: 5,
          permissions: ['knowledge:export', 'knowledge:import'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Create session
        const sessionToken = `session_sunset_${Date.now()}`;
        data.sessions.push({
          id: `session_sunset_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: null,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        sessionId = sessionToken;
      });
    });

    afterEach(async () => {
      if (testApp) {
        await testApp.close();
      }
    });

    it('status reports ready to sunset when no unmigrated entries remain', async () => {
      // Start with no legacy entries - all clear
      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // No legacy entries = ready to sunset
      expect(json.totalLegacyEntries).toBe(0);
      expect(json.unmigratedEntriesCount).toBe(0);
      expect(json.sunsetReady).toBe(true);
      expect(json.sunsetBlockers).toEqual([]);
      expect(json.coexistenceActive).toBe(false);
    });

    it('status reports blocked when unmigrated entries remain', async () => {
      // Add unmigrated legacy entries
      await testStore.transact(async (data) => {
        data.knowledgeEntries.push({
          id: 'knowledge_unmigrated_1',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Unmigrated Entry 1',
          detail: 'This entry has not been migrated',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Unmigrated Entry 1',
            detail: 'This entry has not been migrated',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Unmigrated Entry 1',
              detail: 'This entry has not been migrated',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_1',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.knowledgeEntries.push({
          id: 'knowledge_unmigrated_2',
          teamId: null,
          scope: 'project',
          labels: ['test'],
          shortcut: 'Unmigrated Entry 2',
          detail: 'Another unmigrated entry',
          requiredLevel: 2,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Unmigrated Entry 2',
            detail: 'Another unmigrated entry',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Unmigrated Entry 2',
              detail: 'Another unmigrated entry',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'project-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_2',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // Should have unmigrated entries blocking sunset
      expect(json.totalLegacyEntries).toBe(2);
      expect(json.unmigratedEntriesCount).toBe(2);
      expect(json.sunsetReady).toBe(false);
      expect(json.sunsetBlockers.length).toBeGreaterThan(0);
      // Blocker should mention unmigrated entries
      expect(json.sunsetBlockers[0]).toContain('unmigrated');
    });

    it('status reports blocked when no artifacts exist yet', async () => {
      // Add legacy entries but no artifacts
      await testStore.transact(async (data) => {
        data.knowledgeEntries.push({
          id: 'knowledge_no_artifacts',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Entry Without Artifacts',
          detail: 'Testing no-artifacts blocker',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Entry Without Artifacts',
            detail: 'Testing no-artifacts blocker',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Entry Without Artifacts',
              detail: 'Testing no-artifacts blocker',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_no_art',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // Coexistence is active when legacy entries exist but no artifacts
      expect(json.totalLegacyEntries).toBe(1);
      expect(json.totalArtifacts).toBe(0);
      expect(json.coexistenceActive).toBe(false); // Only true when both legacy AND artifacts exist
      expect(json.sunsetReady).toBe(false);
    });

    it('status reports coexistence active when both legacy and artifacts exist', async () => {
      // Add both legacy entries and migrated artifacts
      await testStore.transact(async (data) => {
        // Legacy entry
        data.knowledgeEntries.push({
          id: 'knowledge_coexist',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          shortcut: 'Coexistence Entry',
          detail: 'Testing coexistence status',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: {
            revision: 1,
            submittedAt: nowIso(),
            submittedByUserId: userId,
            shortcut: 'Coexistence Entry',
            detail: 'Testing coexistence status',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: 'Coexistence Entry',
              detail: 'Testing coexistence status',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_coexist',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          lifecycleHistory: [],
          reviewHistory: [],
          agentReview: null,
          embeddingCache: null,
          indexState: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Migrated artifact
        if (!data.skillArtifacts) data.skillArtifacts = [];
        data.skillArtifacts.push({
          id: 'artifact_migrated_1',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          title: 'Migrated Artifact',
          slug: 'migrated-artifact',
          requiredLevel: 0,
          ownerUserId: userId,
          lifecycleState: 'approved',
          latestRevision: {
            revision: 1,
            files: [],
            scriptDescriptors: [],
            submittedAt: nowIso(),
            submittedByUserId: userId,
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              files: [],
              scriptDescriptors: [],
              submittedAt: nowIso(),
              submittedByUserId: userId,
              reviewNotes: [],
            },
          ],
          metadata: {
            sourceKind: 'legacy-knowledge',
            sourceHash: 'test-hash',
            provenance: {
              migratedFromEntryId: 'knowledge_coexist',
              migratedAt: nowIso(),
            },
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // Coexistence is active when both exist
      expect(json.totalLegacyEntries).toBe(1);
      expect(json.totalArtifacts).toBe(1);
      expect(json.coexistenceActive).toBe(true);
      expect(json.artifactsBySourceKind['legacy-knowledge']).toBe(1);
    });

    it('status includes unmigrated entry IDs sample for operational visibility', async () => {
      // Add multiple unmigrated entries
      await testStore.transact(async (data) => {
        for (let i = 0; i < 5; i++) {
          data.knowledgeEntries.push({
            id: `knowledge_sample_${i}`,
            teamId: null,
            scope: 'global',
            labels: ['test'],
            shortcut: `Sample Entry ${i}`,
            detail: `Sample detail ${i}`,
            requiredLevel: 0,
            lifecycleState: 'approved',
            ownerUserId: userId,
            latestRevision: {
              revision: 1,
              submittedAt: nowIso(),
              submittedByUserId: userId,
              shortcut: `Sample Entry ${i}`,
              detail: `Sample detail ${i}`,
              labels: ['test'],
              reviewNotes: [],
            },
            history: [
              {
                revision: 1,
                submittedAt: nowIso(),
                submittedByUserId: userId,
                shortcut: `Sample Entry ${i}`,
                detail: `Sample detail ${i}`,
                labels: ['test'],
                reviewNotes: [],
              },
            ],
            metadata: {
              scopeLabel: 'global-constraint',
              submissionCount: 1,
              resubmissionCount: 0,
              revisionCount: 1,
              latestSubmissionId: `submission_sample_${i}`,
              latestSubmittedAt: nowIso(),
              latestReviewedAt: nowIso(),
              latestDecision: 'approve',
            },
            lifecycleHistory: [],
            reviewHistory: [],
            agentReview: null,
            embeddingCache: null,
            indexState: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
      });

      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // Should include sample of unmigrated entry IDs
      expect(json.unmigratedEntryIds.length).toBeGreaterThan(0);
      expect(json.unmigratedEntryIds.length).toBeLessThanOrEqual(50);
      // All returned IDs should be valid entry IDs
      for (const entryId of json.unmigratedEntryIds) {
        expect(entryId).toMatch(/^knowledge_sample_\d+$/);
      }
    });

    it('status response is metadata-only without bundle content (T-16-07)', async () => {
      // The status response should only contain counts and blocker reasons
      // not actual artifact bundles or knowledge entry content
      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // Verify response structure is metadata-only
      expect(json).toHaveProperty('totalLegacyEntries');
      expect(json).toHaveProperty('migratedEntriesCount');
      expect(json).toHaveProperty('unmigratedEntriesCount');
      expect(json).toHaveProperty('totalArtifacts');
      expect(json).toHaveProperty('artifactsBySourceKind');
      expect(json).toHaveProperty('unmigratedEntryIds');
      expect(json).toHaveProperty('coexistenceActive');
      expect(json).toHaveProperty('sunsetReady');
      expect(json).toHaveProperty('sunsetBlockers');
      expect(json).toHaveProperty('reportedAt');

      // Should NOT have content fields like bundles, entries, or payloads
      expect(json).not.toHaveProperty('bundles');
      expect(json).not.toHaveProperty('entries');
      expect(json).not.toHaveProperty('payloads');
    });
  });

  describe('async status cache metrics (Phase 6)', () => {
    let testApp: FastifyInstance;
    let testStore: SkillShareerStore;
    let sessionToken: string;
    let intentCache: InMemoryIntentCache | null = null;

    beforeEach(async () => {
      clearRetrievalCacheRegistry();
      resetCacheFreshnessForTests();
      resetQueryEmbeddingCacheForTests();
      resetRetrievalReadModelCacheForTests();
      const testDataFile = `/tmp/trapmap-test-async-status-${Date.now()}-${Math.random()}.json`;
      testApp = buildServer({ config: { dataFile: testDataFile } });
      await testApp.ready();
      testStore = testApp.skillShareer.store;

      await testStore.transact(async (data) => {
        data.users.push({
          id: 'user_async_status',
          handle: 'async-status',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        data.memberships.push({
          id: 'membership_async_status',
          userId: 'user_async_status',
          teamId: null,
          roleTemplate: 'admin',
          securityLevel: 5,
          permissions: ['knowledge:export'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        sessionToken = `session_async_status_${Date.now()}`;
        data.sessions.push({
          id: `session_async_status_${Date.now()}`,
          userId: 'user_async_status',
          tokenHash: hashSecret(sessionToken),
          activeTeamId: null,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      });
    });

    afterEach(async () => {
      intentCache?.dispose();
      intentCache = null;
      if (testApp) {
        await testApp.close();
      }
    });

    it('exposes retrieval cache metrics on async status route', async () => {
      resetQueryEmbeddingCacheForTests();
      setCachedQueryEmbedding('Docker cache', [0.1, 0.2, 0.3]);
      expect(getCachedQueryEmbedding('docker   CACHE')).toEqual([0.1, 0.2, 0.3]);

      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status/async',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.cache).toBeDefined();
      expect(json.cache['query-embedding']).toMatchObject({
        hits: expect.any(Number),
        misses: expect.any(Number),
        size: expect.any(Number),
        hitRate: expect.any(Number),
      });
      expect(json.cache['query-embedding'].hits).toBeGreaterThanOrEqual(1);
    });

    it('surfaces retrieval read-model and intent cache invalidation signals', async () => {
      setCachedRetrievalReadModel({
        knowledgeEntries: [],
        skillArtifacts: [],
        conflicts: [],
      });
      expect(getCachedRetrievalReadModel()).not.toBeNull();

      intentCache = new InMemoryIntentCache();
      intentCache.set('docker cache', {
        seed: 'docker cache',
        normalized: 'docker cache',
        situation: null,
        problem: null,
        goal: null,
        errorText: null,
        tokens: [],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      });
      expect(intentCache.get('docker cache')).not.toBeNull();

      emitCacheInvalidation(
        createCacheInvalidationEvent({
          sourceType: 'trap',
          sourceId: 'knowledge-2',
          reason: 'approved',
          owner: 'knowledge-lifecycle-projection',
          trigger: 'operator-request',
        }),
      );

      expect(getCachedRetrievalReadModel()).toBeNull();
      expect(intentCache.get('docker cache')).toBeNull();

      const response = await testApp.inject({
        method: 'GET',
        url: '/v1/operations/status/async',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.cache['retrieval-read-model']).toMatchObject({
        hits: expect.any(Number),
        misses: expect.any(Number),
        invalidations: 1,
        size: 0,
      });
      expect(json.cache.intent).toMatchObject({
        hits: expect.any(Number),
        misses: expect.any(Number),
        invalidations: 1,
        size: 0,
      });
    });
  });
});

describeIfDb('operations async status routes', () => {
  let app: FastifyInstance;
  let sessionId: string;

  beforeEach(async () => {
    app = buildServer({ config: { databaseUrl: DATABASE_URL! } as any });
    await app.ready();

    const store = app.skillShareer.store as any;
    await store.transact(async (data: any) => {
      data.users.push({
        id: 'user_async_ops',
        handle: 'asyncops',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'membership_async_ops',
        userId: 'user_async_ops',
        teamId: null,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:export', 'stats:read'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      const token = `session_async_${Date.now()}`;
      data.sessions.push({
        id: `session_async_ops_${Date.now()}`,
        userId: 'user_async_ops',
        tokenHash: hashSecret(token),
        activeTeamId: null,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      sessionId = token;
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns queue and outbox backlog snapshots', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: `Bearer ${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      asyncRuntimeEnabled: true,
      queue: expect.objectContaining({
        pending: expect.any(Number),
        dead: expect.any(Number),
      }),
      outbox: expect.objectContaining({
        pending: expect.any(Number),
        failed: expect.any(Number),
      }),
      workflows: expect.any(Array),
    });
  });
});
