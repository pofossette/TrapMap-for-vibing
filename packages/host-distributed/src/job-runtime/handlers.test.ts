import { InvocationError } from '@trapmap/backend-core';
import { describe, expect, it, vi } from 'vitest';

import { createJobRuntimeTaskHandlers } from './handlers.js';

describe('distributed job-runtime task handlers', () => {
  it('returns the distributed governance task handlers with the exact task types', () => {
    const handlers = createJobRuntimeTaskHandlers({
      governanceReview: {
        detectConflicts: vi.fn(),
        reactivateRemediation: vi.fn(),
        exportBadcaseDraft: vi.fn(),
      },
    });

    expect(handlers.map(({ type }) => type)).toEqual([
      'governance.conflict-detection',
      'feedback.remediation-reactivation',
      'feedback.badcase-export-draft',
    ]);
  });

  it('consumes governance conflict tasks through the governance owner client', async () => {
    const detectConflicts = vi.fn(async () => ({
      status: 200,
      body: { detectedCount: 1 },
    }));
    const handlers = createJobRuntimeTaskHandlers({
      governanceReview: {
        detectConflicts,
        reactivateRemediation: vi.fn(),
        exportBadcaseDraft: vi.fn(),
      },
    });

    const handler = handlers.find(({ type }) => type === 'governance.conflict-detection');
    expect(handler).toBeDefined();

    await handler?.handle(
      {
        id: 'task-1',
        type: 'governance.conflict-detection',
        payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
        attempt: 1,
      },
      new AbortController().signal,
    );

    expect(detectConflicts).toHaveBeenCalledWith({ entryId: 'entry-1' });
  });

  it('validates remediation payloads before invoking the remote governance owner', async () => {
    const reactivateRemediation = vi.fn(async () => ({ status: 200, body: null }));
    const handlers = createJobRuntimeTaskHandlers({
      governanceReview: {
        detectConflicts: vi.fn(),
        reactivateRemediation,
        exportBadcaseDraft: vi.fn(),
      },
    });

    const handler = handlers.find(({ type }) => type === 'feedback.remediation-reactivation');
    expect(handler).toBeDefined();

    await expect(
      handler?.handle(
        {
          id: 'task-2',
          type: 'feedback.remediation-reactivation',
          payload: {
            entryId: 'entry-1',
            entryType: 'trap',
            feedbackIds: [],
            resolvedAt: '2026-07-19T00:00:00.000Z',
            resolvedByUserId: 'admin-1',
            notes: 'reactivate retrieval',
          },
          attempt: 1,
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow();

    expect(reactivateRemediation).not.toHaveBeenCalled();
  });

  it('delegates the feedback handlers through the remote governance owner client', async () => {
    const reactivateRemediation = vi.fn(async () => ({ status: 200, body: null }));
    const exportBadcaseDraft = vi.fn(async () => ({ status: 200, body: null }));
    const handlers = createJobRuntimeTaskHandlers({
      governanceReview: {
        detectConflicts: vi.fn(),
        reactivateRemediation,
        exportBadcaseDraft,
      },
    });

    const remediationHandler = handlers.find(
      ({ type }) => type === 'feedback.remediation-reactivation',
    );
    const badcaseHandler = handlers.find(({ type }) => type === 'feedback.badcase-export-draft');

    await remediationHandler?.handle(
      {
        id: 'task-3',
        type: 'feedback.remediation-reactivation',
        payload: {
          entryId: 'entry-1',
          entryType: 'trap',
          feedbackIds: ['feedback-1'],
          resolvedAt: '2026-07-19T00:00:00.000Z',
          resolvedByUserId: 'admin-1',
          notes: 'reactivate retrieval',
        },
        attempt: 1,
      },
      new AbortController().signal,
    );

    await badcaseHandler?.handle(
      {
        id: 'task-4',
        type: 'feedback.badcase-export-draft',
        payload: {
          feedbackId: 'feedback-1',
          entryId: 'entry-1',
          entryType: 'trap',
          queryId: 'query-1',
          requestId: 'request-1',
          traceId: 'trace-1',
        },
        attempt: 1,
      },
      new AbortController().signal,
    );

    expect(reactivateRemediation).toHaveBeenCalledWith({
      entryId: 'entry-1',
      entryType: 'trap',
      feedbackIds: ['feedback-1'],
      resolvedAt: '2026-07-19T00:00:00.000Z',
      resolvedByUserId: 'admin-1',
      notes: 'reactivate retrieval',
    });
    expect(exportBadcaseDraft).toHaveBeenCalledWith({
      feedbackId: 'feedback-1',
      entryId: 'entry-1',
      entryType: 'trap',
      queryId: 'query-1',
      requestId: 'request-1',
      traceId: 'trace-1',
    });
  });

  it.each([
    [
      'feedback.remediation-reactivation',
      'reactivateRemediation',
      { status: 409, body: { error: 'already-reactivated', kind: 'conflict' } },
      'conflict',
      'already-reactivated',
      {
        entryId: 'entry-1',
        entryType: 'trap',
        feedbackIds: ['feedback-1'],
        resolvedAt: '2026-07-19T00:00:00.000Z',
        resolvedByUserId: 'admin-1',
        notes: 'reactivate retrieval',
      },
    ],
    [
      'feedback.badcase-export-draft',
      'exportBadcaseDraft',
      { status: 503, body: { error: 'badcase export unavailable', kind: 'unavailable' } },
      'unavailable',
      'badcase export unavailable',
      {
        feedbackId: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'trap',
        queryId: 'query-1',
        requestId: 'request-1',
        traceId: 'trace-1',
      },
    ],
  ] as const)(
    'propagates remote %s failures as InvocationError values',
    async (type, methodName, remoteResponse, expectedKind, expectedMessage, payload) => {
      const governanceReview = {
        detectConflicts: vi.fn(async () => ({ status: 200, body: { detectedCount: 1 } })),
        reactivateRemediation: vi.fn(async () => ({ status: 200, body: null })),
        exportBadcaseDraft: vi.fn(async () => ({ status: 200, body: null })),
      };
      governanceReview[methodName] = vi.fn(async () => remoteResponse);

      const handlers = createJobRuntimeTaskHandlers({
        governanceReview,
      });
      const handler = handlers.find(({ type: taskType }) => taskType === type);

      await expect(
        handler?.handle(
          {
            id: `task-${type}`,
            type,
            payload,
            attempt: 1,
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow(InvocationError);

      try {
        await handler?.handle(
          {
            id: `task-${type}-again`,
            type,
            payload,
            attempt: 1,
          },
          new AbortController().signal,
        );
      } catch (err) {
        expect(err).toBeInstanceOf(InvocationError);
        const invocationError = err as InvocationError;
        expect(invocationError.kind).toBe(expectedKind);
        expect(invocationError.message).toBe(expectedMessage);
        expect(invocationError.cause).toEqual(remoteResponse.body);
      }
    },
  );
});
