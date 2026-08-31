import { type FeedbackRepositoryPort, InvocationError } from '@trapmap/backend-core';
import { describe, expect, it, vi } from 'vitest';

import { createGovernanceAsyncCommandModule } from '../src/async-commands.ts';

type FeedbackRecord = NonNullable<Awaited<ReturnType<FeedbackRepositoryPort['getById']>>>;

function createFeedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: 'feedback-1',
    entryId: 'entry-1',
    entryType: 'trap',
    problemType: 'incorrect',
    description: 'incorrect result',
    context: null,
    querySeed: null,
    queryId: 'query-1',
    routeFamily: null,
    failureClassification: null,
    expectedCorrection: null,
    selectedResultSnapshot: null,
    submittedAt: '2026-07-18T00:00:00.000Z',
    submittedByUserId: 'user-1',
    submittedByHandle: 'alice',
    status: 'resolved',
    adminNotes: 'remediation applied',
    resolvedAt: '2026-07-19T00:00:00.000Z',
    resolvedByUserId: 'admin-1',
    triggeredTransition: null,
    remediationStatus: 'ready-to-reindex',
    remediationOpenedAt: '2026-07-18T12:00:00.000Z',
    remediationOpenedByUserId: 'admin-0',
    remediationResolvedAt: '2026-07-19T00:00:00.000Z',
    remediationResolvedByUserId: 'admin-1',
    customAnswers: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

function createFeedbackRepo(records: FeedbackRecord[]) {
  const store = new Map(records.map((record) => [record.id, { ...record }]));
  const feedbackRepo: FeedbackRepositoryPort = {
    nextId: vi.fn(async () => 'feedback-next'),
    insert: vi.fn(async () => undefined),
    getById: vi.fn(async (feedbackId: string) => {
      const record = store.get(feedbackId);
      return record ? { ...record } : null;
    }),
    listByEntry: vi.fn(async (entryId: string) =>
      [...store.values()].filter((record) => record.entryId === entryId),
    ),
    listByStatus: vi.fn(async (status: string) =>
      [...store.values()].filter((record) => record.status === status),
    ),
    listByFilter: vi.fn(async () => [...store.values()]),
    update: vi.fn(async (feedbackId: string, updates: Partial<FeedbackRecord>) => {
      const current = store.get(feedbackId);
      if (!current) {
        throw InvocationError.notFound(`Feedback not found: ${feedbackId}`);
      }
      store.set(feedbackId, { ...current, ...updates });
    }),
  };
  return { feedbackRepo, store };
}

describe('governance async commands', () => {
  it('reactivates matching feedback records and remains safe on duplicate delivery', async () => {
    const { feedbackRepo, store } = createFeedbackRepo([
      createFeedback({ id: 'feedback-1' }),
      createFeedback({ id: 'feedback-2' }),
      createFeedback({ id: 'feedback-3', entryId: 'entry-2' }),
    ]);
    const auditLog = {
      record: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ items: [], total: 0 })),
    };
    const module = createGovernanceAsyncCommandModule({ feedbackRepo, auditLog });
    const payload = {
      entryId: 'entry-1',
      entryType: 'trap' as const,
      feedbackIds: ['feedback-1', 'feedback-2'],
      resolvedAt: '2026-07-19T00:00:00.000Z',
      resolvedByUserId: 'admin-1',
      notes: 'reactivate retrieval',
    };

    await module.reactivateRemediation(payload);
    await expect(module.reactivateRemediation(payload)).resolves.toBeUndefined();

    expect(feedbackRepo.update).toHaveBeenCalledWith(
      'feedback-1',
      expect.objectContaining({
        remediationStatus: null,
        updatedAt: expect.any(String),
      }),
    );
    expect(feedbackRepo.update).toHaveBeenCalledWith(
      'feedback-2',
      expect.objectContaining({
        remediationStatus: null,
        updatedAt: expect.any(String),
      }),
    );
    expect(store.get('feedback-1')).toMatchObject({
      resolvedAt: '2026-07-19T00:00:00.000Z',
      resolvedByUserId: 'admin-1',
      remediationResolvedAt: '2026-07-19T00:00:00.000Z',
      remediationResolvedByUserId: 'admin-1',
      remediationStatus: null,
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'entry-1',
        metadata: {
          entryId: 'entry-1',
          feedbackIds: ['feedback-1', 'feedback-2'],
        },
      }),
    );
  });

  it('rejects remediation reactivation when a referenced feedback record belongs elsewhere', async () => {
    const { feedbackRepo } = createFeedbackRepo([
      createFeedback({ id: 'feedback-1', entryId: 'entry-9', entryType: 'skill' }),
    ]);
    const module = createGovernanceAsyncCommandModule({ feedbackRepo });

    await expect(
      module.reactivateRemediation({
        entryId: 'entry-1',
        entryType: 'trap',
        feedbackIds: ['feedback-1'],
        resolvedAt: '2026-07-19T00:00:00.000Z',
        resolvedByUserId: 'admin-1',
        notes: null,
      }),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(feedbackRepo.update).not.toHaveBeenCalled();
  });

  it('audits badcase export draft requests without changing feedback ownership state', async () => {
    const { feedbackRepo } = createFeedbackRepo([
      createFeedback({
        id: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'skill',
        queryId: null,
      }),
    ]);
    const auditLog = {
      record: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ items: [], total: 0 })),
    };
    const module = createGovernanceAsyncCommandModule({ feedbackRepo, auditLog });

    await module.exportBadcaseDraft({
      feedbackId: 'feedback-1',
      entryId: 'entry-1',
      entryType: 'skill',
      queryId: null,
      requestId: null,
      traceId: null,
    });

    expect(feedbackRepo.update).not.toHaveBeenCalled();
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'feedback-1',
        metadata: {
          feedbackId: 'feedback-1',
          entryId: 'entry-1',
          entryType: 'skill',
          queryId: null,
          requestId: null,
          traceId: null,
        },
      }),
    );
  });

  it('rejects badcase export draft when the feedback record is missing', async () => {
    const { feedbackRepo } = createFeedbackRepo([]);
    const module = createGovernanceAsyncCommandModule({ feedbackRepo });

    await expect(
      module.exportBadcaseDraft({
        feedbackId: 'missing',
        entryId: 'entry-1',
        entryType: 'trap',
        queryId: 'query-1',
        requestId: 'request-1',
        traceId: 'trace-1',
      }),
    ).rejects.toMatchObject({ kind: 'not-found' });
  });
});
