import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DecayMeta, KnowledgeSubmission } from '@trapmap/contracts';
import { buildServer } from '@trapmap/server/app.js';
import type { KnowledgeRecord, SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

/**
 * Helper to create a test knowledge entry with decay metadata.
 */
function createTestEntry(args: {
  id: string;
  shortcut: string;
  detail: string;
  teamId: string | null;
  requiredLevel: number;
  lifecycleState: 'approved' | 'pending' | 'rejected' | 'deactivated';
  decayMeta: DecayMeta | null;
  createdAt?: string;
  updatedAt?: string;
}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: args.id,
    teamId: args.teamId,
    scope: 'project',
    labels: ['test'],
    shortcut: args.shortcut,
    detail: args.detail,
    requiredLevel: args.requiredLevel,
    lifecycleState: args.lifecycleState,
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: args.createdAt ?? now,
      submittedByUserId: 'user-1',
      shortcut: args.shortcut,
      detail: args.detail,
      labels: ['test'],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: args.createdAt ?? now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    latestSubmissionId: 'sub-1',
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    decayMeta: args.decayMeta,
    createdAt: args.createdAt ?? now,
    updatedAt: args.updatedAt ?? now,
  };
}

/**
 * Helper to get auth headers for system-admin access.
 */
async function getSystemAdminAuth(app: FastifyInstance): Promise<{ Authorization: string }> {
  const data = await app.skillShareer.store.snapshot();

  // Find existing system-admin session or create one
  const existingSession = data.sessions.find((s) => s.subjectType === 'system-admin');
  if (existingSession) {
    // We need the actual token, not the hash - this is a test helper limitation
    // For tests, we'll use a direct system admin key approach
  }

  // Use system admin login
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: {
      systemAdminKey: 'test-system-admin-key',
    },
  });

  if (loginResponse.statusCode !== 200) {
    // Create session directly
    const token = 'test-decay-admin-token';
    const tokenHash = hashSecret(token);
    await app.skillShareer.store.transact((txData) => {
      txData.sessions.push({
        id: 'decay-test-session',
        subjectType: 'system-admin',
        userId: null,
        activeTeamId: null,
        tokenHash,
        expiresAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });
    return { Authorization: `Bearer ${token}` };
  }

  const loginJson = loginResponse.json() as { token?: string };
  return { Authorization: `Bearer ${loginJson.token}` };
}

/**
 * Helper to create a regular user session with specific permissions.
 */
async function _getUserAuth(
  app: FastifyInstance,
  userId: string,
  teamId: string,
  _permissions: string[] = [],
): Promise<{ Authorization: string }> {
  const token = `test-user-token-${userId}`;
  const tokenHash = hashSecret(token);

  await app.skillShareer.store.transact((txData) => {
    // Ensure user exists
    if (!txData.users.find((u) => u.id === userId)) {
      txData.users.push({
        id: userId,
        handle: `user-${userId}`,
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    // Ensure team exists
    if (!txData.teams.find((t) => t.id === teamId)) {
      txData.teams.push({
        id: teamId,
        name: `Team ${teamId}`,
        slug: `team-${teamId}`,
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    // Ensure membership exists
    if (!txData.memberships.find((m) => m.userId === userId && m.teamId === teamId)) {
      txData.memberships.push({
        id: `membership-${userId}-${teamId}`,
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 5,
        permissions,
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    // Create session
    txData.sessions.push({
      id: `session-${userId}`,
      subjectType: 'user',
      userId,
      activeTeamId: teamId,
      tokenHash,
      expiresAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  });

  return { Authorization: `Bearer ${token}` };
}

describe('decay routes', () => {
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

  describe('GET /v1/operations/decay/entries', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/decay/entries',
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns entries with computed decay state', async () => {
      const auth = await getSystemAdminAuth(app);

      // Create test entries with different decay states
      const now = new Date();
      const _oldDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      const olderDate = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-1',
            shortcut: 'active-entry',
            detail: 'An active entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: nowIso(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
          createTestEntry({
            id: 'entry-2',
            shortcut: 'stale-entry',
            detail: 'A stale entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: olderDate.toISOString(),
              decayState: 'stale',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/decay/entries',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items).toBeDefined();
      expect(json.total).toBeGreaterThanOrEqual(2);
      expect(json.items[0]).toHaveProperty('decayState');
      expect(json.items[0]).toHaveProperty('ageDays');
      expect(json.items[0]).toHaveProperty('lastVerifiedAt');
    });

    it('filters by decayStates param', async () => {
      const auth = await getSystemAdminAuth(app);
      const now = new Date();
      const oldDate = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-active',
            shortcut: 'active-only',
            detail: 'Active entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: nowIso(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
          createTestEntry({
            id: 'entry-stale',
            shortcut: 'stale-only',
            detail: 'Stale entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: oldDate.toISOString(),
              decayState: 'stale',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/decay/entries?decayStates=stale',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBeGreaterThanOrEqual(1);
      // All returned items should have stale decay state
      for (const item of json.items) {
        expect(item.decayState).toBe('stale');
      }
    });

    it('filters by ageMinDays/ageMaxDays', async () => {
      const auth = await getSystemAdminAuth(app);
      const now = new Date();
      const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);
      const hundredFiftyDaysAgo = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-young',
            shortcut: 'young-entry',
            detail: 'Young entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: fiftyDaysAgo.toISOString(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
          createTestEntry({
            id: 'entry-old',
            shortcut: 'old-entry',
            detail: 'Old entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: hundredFiftyDaysAgo.toISOString(),
              decayState: 'review-due',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/decay/entries?ageMinDays=100',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      // All returned items should have age >= 100 days
      for (const item of json.items) {
        if (item.ageDays !== null) {
          expect(item.ageDays).toBeGreaterThanOrEqual(100);
        }
      }
    });

    it('respects limit', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        for (let i = 0; i < 30; i++) {
          data.knowledgeEntries.push(
            createTestEntry({
              id: `entry-limit-${i}`,
              shortcut: `limit-entry-${i}`,
              detail: `Entry ${i}`,
              teamId: null,
              requiredLevel: 5,
              lifecycleState: 'approved',
              decayMeta: {
                lastVerifiedAt: nowIso(),
                decayState: 'active',
                supersededById: null,
                decayStateComputedAt: nowIso(),
                freshnessType: 'evergreen',
              },
            }),
          );
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/decay/entries?limit=5',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(5);
      expect(json.total).toBeGreaterThanOrEqual(30);
    });
  });

  describe('POST /v1/operations/decay/batch', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/batch',
        payload: {
          action: 'extend',
          entryIds: ['entry-1'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('dry-run returns plan without persisting', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-dry-run',
            shortcut: 'dry-run-test',
            detail: 'Test dry run',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: nowIso(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/batch',
        headers: auth,
        payload: {
          action: 'extend',
          entryIds: ['entry-dry-run'],
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.dryRun).toBe(true);
      expect(json.appliedAt).toBeNull();
      expect(json.items.length).toBe(1);
      expect(json.items[0].eligible).toBe(true);

      // Verify entry was not modified
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-dry-run');
      expect(entry?.decayMeta?.decayState).toBe('active');
    });

    it('apply persists changes (extend action)', async () => {
      const auth = await getSystemAdminAuth(app);
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-extend',
            shortcut: 'extend-test',
            detail: 'Test extend action',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: oldDate.toISOString(),
              decayState: 'review-due',
              supersededById: null,
              decayStateComputedAt: oldDate.toISOString(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/batch',
        headers: auth,
        payload: {
          action: 'extend',
          entryIds: ['entry-extend'],
          dryRun: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.dryRun).toBe(false);
      expect(json.appliedAt).not.toBeNull();
      expect(json.items[0].eligible).toBe(true);

      // Verify entry was modified
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-extend');
      expect(entry?.decayMeta?.decayState).toBe('active');
      expect(entry?.lifecycleHistory.length).toBeGreaterThan(0);
    });

    it('returns ineligible items with reason', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-non-approved',
            shortcut: 'pending-entry',
            detail: 'Pending entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'pending', // Not approved
            decayMeta: null,
          }),
          createTestEntry({
            id: 'entry-nonexistent',
            shortcut: 'nonexistent',
            detail: 'This ID will not exist',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: null,
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/batch',
        headers: auth,
        payload: {
          action: 'extend',
          entryIds: ['entry-non-approved', 'nonexistent-id'],
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.totalIneligible).toBe(2);
      for (const item of json.items) {
        expect(item.eligible).toBe(false);
        expect(item.ineligibilityReason).not.toBeNull();
      }
    });
  });

  describe('POST /v1/operations/decay/search', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/search',
        payload: {
          pattern: 'test',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns entries matching pattern with decay enrichment', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-search-1',
            shortcut: 'search-test-unique',
            detail: 'Contains searchable pattern',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: nowIso(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
          createTestEntry({
            id: 'entry-search-2',
            shortcut: 'other-entry',
            detail: 'Different content',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: nowIso(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/search',
        headers: auth,
        payload: {
          pattern: 'searchable',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].shortcut).toBe('search-test-unique');
      expect(json.items[0]).toHaveProperty('decayState');
    });

    it('filters by decayStates', async () => {
      const auth = await getSystemAdminAuth(app);
      const now = new Date();
      const oldDate = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-stale-search',
            shortcut: 'stale-search-entry',
            detail: 'Searchable stale content',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: oldDate.toISOString(),
              decayState: 'stale',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
          createTestEntry({
            id: 'entry-active-search',
            shortcut: 'active-search-entry',
            detail: 'Searchable active content',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: nowIso(),
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: nowIso(),
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/decay/search',
        headers: auth,
        payload: {
          pattern: 'Searchable',
          decayStates: ['stale'],
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].decayState).toBe('stale');
    });
  });

  describe('outbox vs direct sync emission convergence (Phase 4)', () => {
    it('uses lifecycle publisher boundary instead of direct eventBus', () => {
      const source = readFileSync(path.join(__dirname, 'decay.ts'), 'utf8');
      const serviceSource = readFileSync(
        path.join(__dirname, '..', 'lib', 'decay', 'application-service.ts'),
        'utf8',
      );
      // decay route now delegates batch orchestration through a narrow lifecycle publisher.
      expect(source).toContain('createDecayBatchApplicationService');
      expect(source).toContain('createLifecyclePublisher');
      expect(source).not.toContain('eventBus: app.skillShareer.eventBus');
      expect(serviceSource).toContain('lifecyclePublisher.publishTransition');
      expect(source).not.toContain('emitDomainEventAsync');
      expect(source).not.toContain('outbox.enqueue');
    });
  });
});
