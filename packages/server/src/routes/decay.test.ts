import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DecayMeta } from '@trapmap/contracts';
import { buildServer } from '@trapmap/server/app.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

function createTestEntry(args: {
  id: string;
  shortcut: string;
  detail: string;
  lifecycleState: 'approved' | 'pending' | 'rejected' | 'deactivated';
  decayMeta: DecayMeta | null;
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
    lifecycleState: args.lifecycleState,
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
    decayMeta: args.decayMeta,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function getSystemAdminAuth(app: FastifyInstance): Promise<{ Authorization: string }> {
  const token = 'test-decay-admin-token';
  const tokenHash = hashSecret(token);
  await app.skillShareer.store.transact((txData) => {
    txData.sessions.push({
      id: `decay-test-session-${Date.now()}`,
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

describe('decay routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer({ config: { dataFile: `/tmp/trapmap-decay-${Date.now()}.json` } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps decay entries read-side working', async () => {
    const auth = await getSystemAdminAuth(app);
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();

    await app.skillShareer.store.transact((data) => {
      data.knowledgeEntries.push(
        createTestEntry({
          id: 'entry-stale',
          shortcut: 'stale-entry',
          detail: 'A stale entry',
          lifecycleState: 'approved',
          decayMeta: {
            lastVerifiedAt: oldDate,
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
      url: '/v1/operations/decay/entries?limit=5',
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 'entry-stale',
        }),
      ],
    });
  });

  it('returns capability_unsupported for decay batch writes', async () => {
    const auth = await getSystemAdminAuth(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/decay/batch',
      headers: auth,
      payload: {
        action: 'extend',
        entryIds: ['entry-1'],
        dryRun: true,
      },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({
      code: 'capability_unsupported',
      message: expect.stringContaining('compatibility shell'),
    });
  });

  it('keeps decay search read-side working', async () => {
    const auth = await getSystemAdminAuth(app);

    await app.skillShareer.store.transact((data) => {
      data.knowledgeEntries.push(
        createTestEntry({
          id: 'entry-search-1',
          shortcut: 'search-test-unique',
          detail: 'Contains searchable pattern',
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
    expect(response.json().items[0]).toMatchObject({
      id: 'entry-search-1',
    });
  });
});
