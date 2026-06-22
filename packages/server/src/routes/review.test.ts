import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('review routes', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionId: string;
  const userId = 'user_review';
  const teamId = 'team_review';
  const entryId = 'knowledge_review_1';

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-review-test-${Date.now()}-${Math.random()}.json`;

    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;

    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: userId,
        handle: 'reviewer',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.teams.push({
        id: teamId,
        name: 'Review Team',
        slug: 'review-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.memberships.push({
        id: 'membership_review',
        userId,
        teamId,
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['knowledge:review'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const token = `review_session_${Date.now()}`;
      data.sessions.push({
        id: `session_${Date.now()}`,
        userId,
        tokenHash: hashSecret(token),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      sessionId = token;

      const submittedAt = nowIso();
      const revision = {
        revision: 1,
        submittedAt,
        submittedByUserId: userId,
        shortcut: 'Needs review',
        detail: 'Read-side review queue projection should still work.',
        labels: ['review'],
        reviewNotes: [],
      };
      data.knowledgeEntries.push({
        id: entryId,
        teamId: null,
        scope: 'global',
        labels: ['review'],
        shortcut: 'Needs review',
        detail: 'Read-side review queue projection should still work.',
        requiredLevel: 0,
        lifecycleState: 'agent-pass',
        ownerUserId: userId,
        latestRevision: revision,
        history: [revision],
        metadata: {
          scopeLabel: 'global-constraint',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'submission_review_1',
          latestSubmittedAt: submittedAt,
          latestReviewedAt: null,
          latestDecision: null,
        },
        latestSubmissionId: 'submission_review_1',
        submissionHistory: [
          {
            id: 'submission_review_1',
            revision: 1,
            submittedAt,
            submittedByUserId: userId,
            lifecycleState: 'agent-pass',
            resubmissionOf: null,
            agentReview: null,
            reviewerDecision: null,
            reviewNotes: [],
          },
        ],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        decayMeta: null,
        evidenceMeta: null,
        maintenanceMeta: null,
        boundary: null,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps review queue projection readable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/knowledge/review-queue',
      headers: {
        authorization: `Bearer ${sessionId}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          entry: expect.objectContaining({
            id: entryId,
          }),
        }),
      ],
    });
  });

  it('returns capability_unsupported for review writes', async () => {
    const before = await store.snapshot();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: {
        authorization: `Bearer ${sessionId}`,
      },
      payload: {
        entryId,
        decision: 'approve',
        notes: 'Should be rejected by compatibility shell',
      },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({
      code: 'capability_unsupported',
      message: expect.stringContaining('compatibility shell'),
    });

    const after = await store.snapshot();
    const beforeEntry = before.knowledgeEntries.find((item) => item.id === entryId);
    const afterEntry = after.knowledgeEntries.find((item) => item.id === entryId);
    expect(afterEntry?.lifecycleState).toBe(beforeEntry?.lifecycleState);
    expect(afterEntry?.reviewHistory).toEqual(beforeEntry?.reviewHistory);
  });

  it('still enforces review permission before compatibility-shell rejection', async () => {
    let limitedSessionId = '';

    await store.transact(async (data) => {
      data.users.push({
        id: 'user_review_limited',
        handle: 'limited',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      data.memberships.push({
        id: 'membership_review_limited',
        userId: 'user_review_limited',
        teamId,
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const token = `review_limited_${Date.now()}`;
      data.sessions.push({
        id: `session_review_limited_${Date.now()}`,
        userId: 'user_review_limited',
        tokenHash: hashSecret(token),
        activeTeamId: teamId,
        subjectType: 'user',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      limitedSessionId = token;
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: {
        authorization: `Bearer ${limitedSessionId}`,
      },
      payload: {
        entryId,
        decision: 'approve',
        notes: 'not allowed',
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
