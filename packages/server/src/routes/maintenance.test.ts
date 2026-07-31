import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { buildPostgresTestServer as buildServer } from '../../../../scripts/testing/server-test-composition.js';
import type { KnowledgeRecord, MaintenanceMetaRecord } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';

function createTestEntry(args: {
  id: string;
  shortcut: string;
  detail: string;
  maintenanceMeta?: MaintenanceMetaRecord | null;
  decayMeta?: {
    lastVerifiedAt: string;
    decayState: string;
    supersededById: string | null;
    decayStateComputedAt: string;
    freshnessType: string;
  } | null;
}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: args.id,
    teamId: null,
    scope: 'project',
    labels: ['test'],
    shortcut: args.shortcut,
    detail: args.detail,
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
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
    evidenceMeta: null,
    boundary: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function getSystemAdminAuth(app: FastifyInstance): Promise<{ Authorization: string }> {
  const token = 'test-maintenance-admin-token';
  const tokenHash = hashSecret(token);
  await app.skillShareer.identity.sessionRepo.create({
    subjectType: 'system-admin',
    userId: null,
    activeTeamId: null,
    tokenHash,
    expiresAt: null,
  });
  return { Authorization: `Bearer ${token}` };
}

describe('maintenance routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({
      ownerReadModel: {
        getReadModel: async () => ({
          knowledgeEntries: [
            createTestEntry({
              id: 'entry-no-owner',
              shortcut: 'no-owner-entry',
              detail: 'No owner assigned',
              maintenanceMeta: {
                maintainerUserId: null,
                maintainerHandle: null,
                maintainerLevel: null,
                reviewBy: null,
              },
            }),
          ],
        }),
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps maintenance entries read-side working', async () => {
    const auth = await getSystemAdminAuth(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/maintenance/entries?missingOwner=true',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 'entry-no-owner',
        }),
      ],
    });
  });
});
