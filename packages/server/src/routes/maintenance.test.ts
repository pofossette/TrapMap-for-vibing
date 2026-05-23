import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { buildServer } from '@trapmap/server/app.js';
import type { KnowledgeRecord, MaintenanceMetaRecord } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';

/**
 * Helper to create a test knowledge entry with maintenance metadata.
 */
function createTestEntry(args: {
  id: string;
  shortcut: string;
  detail: string;
  teamId: string | null;
  requiredLevel: number;
  lifecycleState: 'approved' | 'pending' | 'rejected' | 'deactivated';
  maintenanceMeta?: MaintenanceMetaRecord | null;
  decayMeta?: {
    lastVerifiedAt: string;
    decayState: string;
    supersededById: string | null;
    decayStateComputedAt: string;
    freshnessType: string;
  } | null;
  scope?: string;
  labels?: string[];
}): KnowledgeRecord {
  const now = nowIso();
  const entry: any = {
    id: args.id,
    teamId: args.teamId,
    scope: args.scope ?? 'project',
    labels: args.labels ?? ['test'],
    shortcut: args.shortcut,
    detail: args.detail,
    requiredLevel: args.requiredLevel,
    lifecycleState: args.lifecycleState,
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user-1',
      shortcut: args.shortcut,
      detail: args.detail,
      labels: args.labels ?? ['test'],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: now,
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
    maintenanceMeta: args.maintenanceMeta ?? null,
    decayMeta: args.decayMeta ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return entry as KnowledgeRecord;
}

/**
 * Helper to get auth headers for system-admin access.
 */
async function getSystemAdminAuth(app: FastifyInstance): Promise<{ Authorization: string }> {
  // Try system admin login
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: {
      systemAdminKey: 'test-system-admin-key',
    },
  });

  if (loginResponse.statusCode === 200) {
    const loginJson = loginResponse.json() as { token?: string };
    return { Authorization: `Bearer ${loginJson.token}` };
  }

  // Create session directly
  const token = 'test-maintenance-admin-token';
  const tokenHash = hashSecret(token);
  await app.skillShareer.store.transact((txData) => {
    txData.sessions.push({
      id: 'maintenance-test-session',
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

describe('maintenance routes', () => {
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

  describe('GET /v1/operations/maintenance/entries', () => {
    it('returns empty list when no entries match filters', async () => {
      const auth = await getSystemAdminAuth(app);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?missingOwner=true',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items).toEqual([]);
      expect(json.total).toBe(0);
    });

    it('returns entries with missing owner when missingOwner=true', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-no-owner',
            shortcut: 'no-owner-entry',
            detail: 'No owner assigned',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            maintenanceMeta: {
              maintainerUserId: null,
              maintainerHandle: null,
              maintainerLevel: null,
              reviewBy: null,
            },
          }),
          createTestEntry({
            id: 'entry-with-owner',
            shortcut: 'has-owner-entry',
            detail: 'Has owner',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            maintenanceMeta: {
              maintainerUserId: 'user_1',
              maintainerHandle: 'alice',
              maintainerLevel: 5,
              reviewBy: null,
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?missingOwner=true',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].id).toBe('entry-no-owner');
      expect(json.items[0].maintainer).toBeNull();
    });

    it('returns entries with overdue review when reviewOverdue=true', async () => {
      const auth = await getSystemAdminAuth(app);
      const pastDate = new Date('2025-01-01T00:00:00.000Z').toISOString();

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-overdue',
            shortcut: 'overdue-entry',
            detail: 'Overdue review',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            maintenanceMeta: {
              maintainerUserId: 'user_1',
              maintainerHandle: 'alice',
              maintainerLevel: 5,
              reviewBy: pastDate,
            },
          }),
          createTestEntry({
            id: 'entry-future-review',
            shortcut: 'future-review-entry',
            detail: 'Future review',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            maintenanceMeta: {
              maintainerUserId: 'user_1',
              maintainerHandle: 'alice',
              maintainerLevel: 5,
              reviewBy: '2027-01-01T00:00:00.000Z',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?reviewOverdue=true',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].id).toBe('entry-overdue');
    });

    it('returns entries with stale verification when staleVerification=true', async () => {
      const auth = await getSystemAdminAuth(app);
      const now = new Date();
      const oldVerified = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString();
      const recentVerified = nowIso();

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-stale',
            shortcut: 'stale-entry',
            detail: 'Stale verification',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: oldVerified,
              decayState: 'stale',
              supersededById: null,
              decayStateComputedAt: oldVerified,
              freshnessType: 'evergreen',
            },
          }),
          createTestEntry({
            id: 'entry-recent',
            shortcut: 'recent-entry',
            detail: 'Recent verification',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            decayMeta: {
              lastVerifiedAt: recentVerified,
              decayState: 'active',
              supersededById: null,
              decayStateComputedAt: recentVerified,
              freshnessType: 'evergreen',
            },
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?staleVerification=true&staleDays=180',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].id).toBe('entry-stale');
    });

    it('filters by scope when provided', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-global',
            shortcut: 'global-entry',
            detail: 'Global scope',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            scope: 'global',
          }),
          createTestEntry({
            id: 'entry-project',
            shortcut: 'project-entry',
            detail: 'Project scope',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            scope: 'project',
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?scope=global',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.every((item: any) => item.scope === 'global')).toBe(true);
    });

    it('filters by labels when provided', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-rust',
            shortcut: 'rust-entry',
            detail: 'Rust entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            labels: ['rust', 'systems'],
          }),
          createTestEntry({
            id: 'entry-python',
            shortcut: 'python-entry',
            detail: 'Python entry',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
            labels: ['python', 'web'],
          }),
        );
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?labels=rust',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].id).toBe('entry-rust');
    });

    it('respects limit parameter', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        for (let i = 0; i < 10; i++) {
          data.knowledgeEntries.push(
            createTestEntry({
              id: `entry-limit-${i}`,
              shortcut: `limit-entry-${i}`,
              detail: `Entry ${i}`,
              teamId: null,
              requiredLevel: 5,
              lifecycleState: 'approved',
            }),
          );
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries?limit=3',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items.length).toBe(3);
      expect(json.total).toBeGreaterThanOrEqual(10);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/maintenance/entries',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/operations/maintenance/batch', () => {
    it('assigns owner with assign-owner action', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-assign',
            shortcut: 'assign-test',
            detail: 'Test assign',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/maintenance/batch',
        headers: auth,
        payload: {
          action: 'assign-owner',
          entryIds: ['entry-assign'],
          newMaintainerId: 'user_new',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.action).toBe('assign-owner');
      expect(json.dryRun).toBe(false);
      expect(json.appliedAt).not.toBeNull();
      expect(json.items[0].eligible).toBe(true);

      // Verify entry was modified
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-assign');
      expect(entry?.maintenanceMeta?.maintainerUserId).toBe('user_new');
    });

    it('stores provided newMaintainerHandle instead of operator handle', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-handle-test',
            shortcut: 'handle-test',
            detail: 'Test handle',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/maintenance/batch',
        headers: auth,
        payload: {
          action: 'assign-owner',
          entryIds: ['entry-handle-test'],
          newMaintainerId: 'user_bob',
          newMaintainerHandle: 'bob-the-builder',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-handle-test');
      expect(entry?.maintenanceMeta?.maintainerUserId).toBe('user_bob');
      expect(entry?.maintenanceMeta?.maintainerHandle).toBe('bob-the-builder');
    });

    it('extends review date with extend-review action', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-extend',
            shortcut: 'extend-test',
            detail: 'Test extend',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/maintenance/batch',
        headers: auth,
        payload: {
          action: 'extend-review',
          entryIds: ['entry-extend'],
          extendDays: 120,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.action).toBe('extend-review');
      expect(json.items[0].eligible).toBe(true);

      // Verify entry was modified
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-extend');
      expect(entry?.maintenanceMeta?.reviewBy).not.toBeNull();
    });

    it('marks verified with mark-verified action', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-verify',
            shortcut: 'verify-test',
            detail: 'Test verify',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/maintenance/batch',
        headers: auth,
        payload: {
          action: 'mark-verified',
          entryIds: ['entry-verify'],
          extendDays: 90,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.action).toBe('mark-verified');
      expect(json.items[0].eligible).toBe(true);

      // Verify entry was modified
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-verify');
      expect(entry?.maintenanceMeta?.reviewBy).not.toBeNull();
    });

    it('dry-run mode returns plan without modifying data', async () => {
      const auth = await getSystemAdminAuth(app);

      await app.skillShareer.store.transact((data) => {
        data.knowledgeEntries.push(
          createTestEntry({
            id: 'entry-dryrun',
            shortcut: 'dryrun-test',
            detail: 'Test dry run',
            teamId: null,
            requiredLevel: 5,
            lifecycleState: 'approved',
          }),
        );
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/maintenance/batch',
        headers: auth,
        payload: {
          action: 'assign-owner',
          entryIds: ['entry-dryrun'],
          newMaintainerId: 'user_new',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.dryRun).toBe(true);
      expect(json.appliedAt).toBeNull();
      expect(json.items[0].eligible).toBe(true);

      // Verify entry was NOT modified
      const data = await app.skillShareer.store.snapshot();
      const entry = data.knowledgeEntries.find((e) => e.id === 'entry-dryrun');
      expect(entry?.maintenanceMeta).toBeNull();
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/maintenance/batch',
        payload: {
          action: 'assign-owner',
          entryIds: ['entry-1'],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
