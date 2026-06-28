import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { clearRetrievalCacheRegistry } from '@trapmap/server/lib/cache/retrieval-cache.js';
import {
  getCachedRetrievalReadModel,
  resetRetrievalReadModelCacheForTests,
  setCachedRetrievalReadModel,
} from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
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

    it('surfaces intent cache invalidation signals alongside cache hit metrics', async () => {
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
      expect(json.cache.intent).toMatchObject({
        hits: expect.any(Number),
        misses: expect.any(Number),
        invalidations: 1,
        size: 0,
      });
      expect(json.cache['retrieval-read-model']).toMatchObject({
        pendingInvalidation: true,
        lastInvalidatedAt: expect.any(String),
      });
      expect(json.freshnessContract).toMatchObject({
        consistencyModel: 'eventual-consistency',
        writeVisibility: {
          authoritativeWriteCommitted: true,
          projectionRefreshPending: true,
          cachesPendingInvalidation: true,
        },
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
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      taskTransportProvider: 'postgres',
      eventTransportProvider: 'postgres',
      adoptionGuidance:
        'Default mode: keep postgres task queue unless sustained backlog thresholds justify RabbitMQ.',
      runtimeContract: expect.objectContaining({
        workerModes: expect.objectContaining({
          api: expect.any(String),
          'task-worker': expect.any(String),
          'outbox-worker': expect.any(String),
          combined: expect.any(String),
        }),
        degradedSemantics: expect.any(String),
      }),
      idempotencyContract: expect.objectContaining({
        syncCommandKey: 'teamId + commandName + clientRequestId',
        asyncTaskKey: expect.any(String),
        bulkJobKey: expect.any(String),
        dedupeWindow: expect.any(String),
      }),
      retryResumeContract: expect.objectContaining({
        queueRetryPolicy: expect.any(String),
        outboxRetryPolicy: expect.any(String),
        runtimeMetricsSemantics: expect.any(String),
        canonicalErrorSemantics: expect.any(String),
        deadLetterPolicy: expect.any(String),
        reclaimPolicy: expect.any(String),
        workflowCheckpointSource: expect.any(String),
        bulkResumePolicy: expect.any(String),
      }),
      freshnessContract: expect.objectContaining({
        consistencyModel: 'eventual-consistency',
        writeVisibility: expect.objectContaining({
          authoritativeWriteCommitted: true,
        }),
        projectionLag: expect.objectContaining({
          queueBacklog: expect.any(Number),
          outboxBacklog: expect.any(Number),
          staleWorkers: expect.any(Number),
          workflowsInFlight: expect.any(Number),
        }),
        operatorGuidance: expect.any(String),
      }),
      failureTaxonomy: expect.arrayContaining([
        expect.objectContaining({ category: 'stale-projection' }),
        expect.objectContaining({ category: 'permanent-failure' }),
      ]),
      operatorHome: expect.objectContaining({
        health: expect.objectContaining({
          headline: expect.any(String),
          status: expect.stringMatching(/healthy|degraded|investigate/),
          summary: expect.any(String),
        }),
        status: expect.objectContaining({
          headline: expect.any(String),
        }),
        freshness: expect.objectContaining({
          headline: expect.any(String),
        }),
        capacity: expect.objectContaining({
          headline: expect.any(String),
        }),
        jobControl: expect.objectContaining({
          headline: expect.any(String),
        }),
      }),
      configGovernance: expect.objectContaining({
        fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
        deploymentProfile: expect.any(String),
        runtimeMode: expect.any(String),
        serviceUnit: expect.any(String),
        deprecatedEnvKeys: expect.any(Array),
        conflictWarnings: expect.any(Array),
      }),
      capacityModel: expect.objectContaining({
        databasePool: expect.objectContaining({
          configured: true,
          maxConnections: null,
        }),
        handlerLatency: expect.objectContaining({
          averageMs: expect.any(Number),
          investigateAboveMs: 5000,
        }),
        backlogPressure: expect.objectContaining({
          queuePending: expect.any(Number),
          outboxPending: expect.any(Number),
          workflowsInFlight: expect.any(Number),
        }),
        cachePressure: expect.objectContaining({
          namespacesWithPendingInvalidation: expect.any(Number),
          staleRecoveryCount: expect.any(Number),
        }),
      }),
      runtimeMetrics: expect.objectContaining({
        totals: expect.objectContaining({
          executions: expect.any(Number),
          degraded: expect.any(Number),
          reclaims: expect.any(Number),
          timeouts: expect.any(Number),
          retryableFailures: expect.any(Number),
          permanentFailures: expect.any(Number),
          retries: expect.any(Number),
          averageLatencyMs: expect.any(Number),
          averageQueueBacklog: expect.any(Number),
          averageOutboxBacklog: expect.any(Number),
          averageStaleWorkers: expect.any(Number),
        }),
        dependencies: expect.any(Object),
      }),
      queue: expect.objectContaining({
        pending: expect.any(Number),
        dead: expect.any(Number),
        serviceUnit: 'full-platform',
        ownership: {
          ownsAny: true,
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: true,
        },
      }),
      outbox: expect.objectContaining({
        pending: expect.any(Number),
        failed: expect.any(Number),
        serviceUnit: 'full-platform',
        ownership: {
          ownsAny: true,
          ownsOutboxWork: true,
        },
      }),
      diagnostics: expect.objectContaining({
        dominantFailureCategory: expect.anything(),
        owningSubsystem: expect.stringMatching(/queue|outbox|workflow|cache|badcase|none/),
        nextInspection: expect.any(String),
        evidence: expect.any(Array),
        badcaseClassificationSummary: expect.objectContaining({
          totalClassified: expect.any(Number),
          counts: expect.any(Array),
        }),
      }),
      cache: expect.any(Object),
      workflows: expect.any(Array),
      bulkOperations: expect.any(Array),
    });
  });

  it('uses skillShareer asyncTransport snapshots as the authoritative status source', async () => {
    const queueSnapshot = {
      provider: 'postgres',
      pending: 17,
      running: 3,
      dead: 1,
      staleRunning: 0,
      backlogOldestAgeSeconds: 12,
      runningOldestAgeSeconds: 9,
      deadOldestAgeSeconds: 30,
      reclaimCount: 4,
      recentDeadLetters: [],
    };
    const outboxSnapshot = {
      provider: 'postgres',
      pending: 8,
      processing: 2,
      failed: 1,
      staleProcessing: 0,
      backlogOldestAgeSeconds: 15,
      processingOldestAgeSeconds: 6,
      failedOldestAgeSeconds: 44,
      reclaimCount: 5,
      recentFailures: [],
    };
    app.skillShareer.asyncTransport = {
      task: {
        kind: 'postgres-task-queue',
        enqueue: vi.fn(),
        enqueueTx: vi.fn(),
        requeue: vi.fn(),
        getStatusSnapshot: vi.fn().mockResolvedValue(queueSnapshot),
      },
      events: {
        kind: 'postgres-domain-outbox',
        enqueue: vi.fn(),
        enqueueTx: vi.fn(),
        claimBatch: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
        getStatusSnapshot: vi.fn().mockResolvedValue(outboxSnapshot),
      },
    } as any;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: `Bearer ${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskTransportProvider: 'postgres',
      eventTransportProvider: 'postgres',
      adoptionGuidance:
        'Default mode: keep postgres task queue unless sustained backlog thresholds justify RabbitMQ.',
      freshnessContract: {
        consistencyModel: 'eventual-consistency',
        writeVisibility: {
          authoritativeWriteCommitted: true,
          projectionRefreshPending: true,
          cachesPendingInvalidation: false,
        },
        projectionLag: {
          queueBacklog: 17,
          outboxBacklog: 8,
          staleWorkers: 0,
          workflowsInFlight: 0,
        },
        operatorGuidance: expect.any(String),
      },
      queue: expect.objectContaining({
        provider: 'postgres',
        pending: 17,
        running: 3,
        reclaimCount: 4,
      }),
      outbox: expect.objectContaining({
        provider: 'postgres',
        pending: 8,
        processing: 2,
        reclaimCount: 5,
      }),
      operatorHome: expect.objectContaining({
        freshness: expect.objectContaining({
          status: 'degraded',
        }),
      }),
      diagnostics: expect.objectContaining({
        dominantFailureCategory: 'stale-projection',
        owningSubsystem: expect.stringMatching(/queue|outbox|cache|badcase/),
      }),
      capacityModel: expect.objectContaining({
        backlogPressure: {
          queuePending: 17,
          outboxPending: 8,
          workflowsInFlight: 0,
        },
      }),
      runtimeMetrics: expect.objectContaining({
        dependencies: expect.objectContaining({
          'async-operator-status': expect.objectContaining({
            averageQueueBacklog: 17,
            averageOutboxBacklog: 8,
            averageStaleWorkers: 0,
          }),
        }),
      }),
    });
    expect(app.skillShareer.asyncTransport.task.kind).toBe('postgres-task-queue');
    expect(app.skillShareer.asyncTransport.events.kind).toBe('postgres-domain-outbox');
    expect(app.skillShareer.asyncTransport.task.getStatusSnapshot).toHaveBeenCalledTimes(1);
    expect(app.skillShareer.asyncTransport.events.getStatusSnapshot).toHaveBeenCalledTimes(1);
  });

  it('keeps domain events on postgres even when rabbitmq task transport is enabled', async () => {
    const rabbitApp = buildServer({
      config: {
        databaseUrl: DATABASE_URL!,
        asyncTaskTransport: {
          provider: 'rabbitmq',
          rabbitmq: {
            url: 'amqp://guest:guest@localhost:5672',
            exchange: 'trapmap.tasks',
            queue: 'trapmap.default',
            prefetch: 1,
          },
        },
      } as any,
    });
    await rabbitApp.ready();

    expect(rabbitApp.skillShareer.asyncTransport?.task.kind).toBe('rabbitmq-task-queue');
    expect(rabbitApp.skillShareer.asyncTransport?.events.kind).toBe('postgres-domain-outbox');

    await rabbitApp.close();
  });

  it('exposes transport providers and rabbitmq adoption guidance in async status', async () => {
    const queueSnapshot = {
      provider: 'rabbitmq' as const,
      pending: 0,
      running: 0,
      dead: 0,
      staleRunning: 0,
      backlogOldestAgeSeconds: null,
      runningOldestAgeSeconds: null,
      deadOldestAgeSeconds: null,
      reclaimCount: 0,
      recentDeadLetters: [],
    };
    const outboxSnapshot = {
      provider: 'postgres' as const,
      pending: 0,
      processing: 0,
      failed: 0,
      staleProcessing: 0,
      backlogOldestAgeSeconds: null,
      processingOldestAgeSeconds: null,
      failedOldestAgeSeconds: null,
      reclaimCount: 0,
      recentFailures: [],
    };
    app.skillShareer.asyncTransport = {
      task: {
        kind: 'rabbitmq-task-queue',
        enqueue: vi.fn(),
        enqueueTx: vi.fn(),
        requeue: vi.fn(),
        getStatusSnapshot: vi.fn().mockResolvedValue(queueSnapshot),
      },
      events: {
        kind: 'postgres-domain-outbox',
        enqueue: vi.fn(),
        enqueueTx: vi.fn(),
        claimBatch: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
        getStatusSnapshot: vi.fn().mockResolvedValue(outboxSnapshot),
      },
    } as any;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: `Bearer ${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskTransportProvider: 'rabbitmq',
      eventTransportProvider: 'postgres',
      adoptionGuidance:
        'RabbitMQ mode enabled: PostgreSQL outbox remains authoritative for domain events.',
      queue: expect.objectContaining({
        provider: 'rabbitmq',
      }),
      outbox: expect.objectContaining({
        provider: 'postgres',
      }),
    });
  });

  it('exposes config governance summary and bulk workflow drill-down for operator surfaces', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: `Bearer ${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.configGovernance).toMatchObject({
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
      profileAwareCapabilitySummary: expect.objectContaining({
        routeSurface: 'gateway-core',
        asyncOwnershipExpectation: expect.any(String),
      }),
    });
    expect(Array.isArray(json.bulkOperations)).toBe(true);
    if (json.bulkOperations.length > 0) {
      expect(json.bulkOperations[0]).toMatchObject({
        runId: expect.any(String),
        workflowType: expect.any(String),
        progress: expect.objectContaining({
          completed: expect.anything(),
          total: expect.anything(),
          percent: expect.anything(),
        }),
        resumeAllowed: expect.any(Boolean),
      });
    }
  });

  it('surfaces workflow correlation context for async follow-up traces', async () => {
    const store = app.skillShareer.store as any;
    await store.getPool().query(
      `INSERT INTO workflow_runs
       (run_id, workflow_type, subject_id, status, step_name, attempt, started_at, completed_at, last_error, stats, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NULL, NULL, $7::jsonb, NOW(), NOW())`,
      [
        'wf_badcase_feedback_test',
        'badcase-export-draft',
        'feedback_test',
        'running',
        'draft-export',
        1,
        JSON.stringify({
          asyncJobId: 'wf_badcase_feedback_test',
          feedbackId: 'feedback_test',
          queryId: 'qry_status_test',
          requestId: 'req_status_test',
          traceId: 'trace_status_test',
          taskType: 'feedback.badcase-export-draft',
        }),
      ],
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: `Bearer ${sessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'wf_badcase_feedback_test',
          correlation: {
            asyncJobId: 'wf_badcase_feedback_test',
            feedbackId: 'feedback_test',
            queryId: 'qry_status_test',
            requestId: 'req_status_test',
            traceId: 'trace_status_test',
          },
        }),
      ]),
    );
  });

  it('reports candidate-ingestion ownership without implying outbox ownership', async () => {
    const candidateApp = buildServer({
      runtimeMode: 'combined',
      serviceUnit: 'candidate-ingestion',
      config: { databaseUrl: DATABASE_URL! } as any,
    });
    await candidateApp.ready();

    const store = candidateApp.skillShareer.store as any;
    let candidateSessionId = '';
    await store.transact(async (data: any) => {
      data.users.push({
        id: 'user_async_ops_candidate',
        handle: 'asyncopscandidate',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'membership_async_ops_candidate',
        userId: 'user_async_ops_candidate',
        teamId: null,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:export', 'stats:read'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      const token = `session_async_candidate_${Date.now()}`;
      data.sessions.push({
        id: `session_async_ops_candidate_${Date.now()}`,
        userId: 'user_async_ops_candidate',
        tokenHash: hashSecret(token),
        activeTeamId: null,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      candidateSessionId = token;
    });

    const response = await candidateApp.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: `Bearer ${candidateSessionId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      asyncRuntimeEnabled: true,
      runtimeMode: 'combined',
      serviceUnit: 'candidate-ingestion',
      taskTransportProvider: 'postgres',
      eventTransportProvider: 'postgres',
      adoptionGuidance:
        'Default mode: keep postgres task queue unless sustained backlog thresholds justify RabbitMQ.',
      queue: expect.objectContaining({
        serviceUnit: 'candidate-ingestion',
        workerState: 'running',
        ownership: {
          ownsAny: true,
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: false,
        },
      }),
      outbox: expect.objectContaining({
        serviceUnit: 'candidate-ingestion',
        workerState: 'remote',
        ownership: {
          ownsAny: false,
          ownsOutboxWork: false,
        },
      }),
    });

    await candidateApp.close();
  });
});
