import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import { createBadcaseExportDraftHandler } from '@trapmap/server/lib/jobs/handlers/badcase-export-draft.js';
import { BADCASE_EXPORT_DRAFT_TASK_TYPE } from '@trapmap/server/lib/jobs/types.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

describe('badcase export route', () => {
  let app: FastifyInstance;
  let sessionToken: string;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-badcase-export-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();

    await app.skillShareer.store.transact(async (data) => {
      data.users.push({
        id: 'user_badcase_export',
        handle: 'badcase-export',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      data.memberships.push({
        id: 'membership_badcase_export',
        userId: 'user_badcase_export',
        teamId: null,
        roleTemplate: 'admin',
        securityLevel: 5,
        permissions: ['knowledge:export', 'knowledge:search'],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      sessionToken = `session_badcase_export_${Date.now()}`;
      data.sessions.push({
        id: `session_badcase_export_${Date.now()}`,
        userId: 'user_badcase_export',
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
    if (app) {
      await app.close();
    }
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/badcases/feedback_1/export',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 or 409 when badcase trace is unavailable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/badcases/feedback_missing/export',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect([404, 409]).toContain(response.statusCode);
  });

  it('keeps durable trace export separate from workflow/operator-only correlation fields', async () => {
    if (!(app.skillShareer.store instanceof PostgresStore)) {
      const unavailable = await app.inject({
        method: 'GET',
        url: '/v1/operations/badcases/feedback_missing/export',
        headers: { authorization: `Bearer ${sessionToken}` },
      });
      expect(unavailable.statusCode).toBe(409);
      return;
    }

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: {
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'This answer points to an outdated result instead of the current guidance.',
        badcase: {
          queryId: 'qry_badcase_export_1',
          querySeed: 'outdated retrieval answer',
          routeFamily: 'entry',
          failureClassification: 'stale-content',
          expectedCorrection: 'Return the latest migration guidance.',
          selectedResultSnapshot: {
            entryId: 'trap_1',
            entryType: 'trap',
            title: 'test trap',
            routeFamily: 'entry',
          },
        },
      },
    });

    expect(response.statusCode).toBe(201);

    const feedbackId = response.json().feedback.id;
    const exportResponse = await app.inject({
      method: 'GET',
      url: `/v1/operations/badcases/${feedbackId}/export`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.json().draft).toMatchObject({
      sourceFeedbackId: feedbackId,
      queryId: 'qry_badcase_export_1',
      request: expect.objectContaining({
        queryId: 'qry_badcase_export_1',
        routeFamily: 'entry',
      }),
    });
    expect(exportResponse.json().draft.request.workflowRunId).toBeUndefined();
    expect(exportResponse.json().draft.request.asyncJobId).toBeUndefined();
    expect(exportResponse.json().draft.debug).toBeUndefined();
  });

  it('proves retrieval -> feedback -> workflow correlation -> export debug contract on the real async path', async () => {
    if (!(app.skillShareer.store instanceof PostgresStore)) {
      const unavailable = await app.inject({
        method: 'GET',
        url: '/v1/operations/badcases/feedback_missing/export',
        headers: { authorization: `Bearer ${sessionToken}` },
      });
      expect(unavailable.statusCode).toBe(409);
      return;
    }

    const retrievalResponse = await app.inject({
      method: 'POST',
      url: '/v1/retrieval/search',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-request-id': 'req_badcase_chain',
        'x-trace-id': 'trace_badcase_chain',
      },
      payload: {
        seed: 'test trap content',
        filters: { labels: [], scopes: ['global'] },
        maxResults: 5,
        includeRefinement: false,
      },
    });

    expect(retrievalResponse.statusCode).toBe(200);
    const queryId = retrievalResponse.json().queryId as string;

    const feedbackResponse = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'x-request-id': 'req_badcase_chain',
        'x-trace-id': 'trace_badcase_chain',
      },
      payload: {
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'The result chain still points to the stale migration answer.',
        badcase: {
          queryId,
          querySeed: 'test trap content',
          routeFamily: 'entry',
          failureClassification: 'stale-content',
          expectedCorrection: 'Return the current answer.',
          selectedResultSnapshot: {
            entryId: 'trap_1',
            entryType: 'trap',
            title: 'test trap',
            routeFamily: 'entry',
          },
        },
      },
    });

    expect(feedbackResponse.statusCode).toBe(201);
    const feedbackId = feedbackResponse.json().feedback.id as string;
    const asyncJobId = feedbackResponse.json().feedback.asyncJobId as string;
    expect(asyncJobId).toBe(`wf_badcase_${feedbackId}`);

    const pool = app.skillShareer.store.getPool();
    const queue = createTaskQueue({ pool });
    const badcaseHandler = createBadcaseExportDraftHandler({
      services: app.skillShareer,
      pool,
    });

    const task = await queue.dequeue<{
      feedbackId: string;
      entryId: string;
      entryType: 'trap' | 'skill';
      queryId: string | null;
      requestId: string | null;
      traceId: string | null;
    }>(BADCASE_EXPORT_DRAFT_TASK_TYPE);
    expect(task).not.toBeNull();
    expect(task?.payload).toMatchObject({
      feedbackId,
      queryId,
      requestId: 'req_badcase_chain',
      traceId: 'trace_badcase_chain',
    });

    const controller = new AbortController();
    await badcaseHandler.handle(task!, controller.signal);
    await queue.complete(task!.id);

    const workflow = await createWorkflowRepository(pool).getByRunId(asyncJobId);
    expect(workflow).toMatchObject({
      runId: asyncJobId,
      workflowType: 'badcase-export-draft',
      correlation: {
        requestId: 'req_badcase_chain',
        traceId: 'trace_badcase_chain',
        queryId,
        feedbackId,
        asyncJobId,
      },
    });

    const exportResponse = await app.inject({
      method: 'GET',
      url: `/v1/operations/badcases/${feedbackId}/export`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.json()).toMatchObject({
      feedbackId,
      draft: {
        sourceFeedbackId: feedbackId,
        queryId,
        request: {
          queryId,
          routeFamily: 'entry',
        },
      },
      debug: {
        correlation: {
          requestId: 'req_badcase_chain',
          traceId: 'trace_badcase_chain',
          queryId,
          feedbackId,
          asyncJobId,
        },
        durableTrace: {
          sourceFeedbackId: feedbackId,
          queryId,
          routeFamily: 'entry',
        },
        workflow: {
          asyncJobId,
          workflowType: 'badcase-export-draft',
          exportDraftReady: true,
        },
      },
    });
    expect(exportResponse.json().draft.request.asyncJobId).toBeUndefined();
    expect(exportResponse.json().draft.debug).toBeUndefined();
  });
});
