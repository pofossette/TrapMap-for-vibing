import { describe, expect, it, vi } from 'vitest';

import { createGovernanceReviewAdminModule } from './admin.ts';

function createFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fb-1',
    entryId: 'entry-1',
    entryType: 'trap',
    problemType: 'incorrect',
    description: 'incorrect result',
    context: null,
    submittedAt: '2026-07-18T00:00:00.000Z',
    submittedByUserId: 'user-1',
    submittedByHandle: 'alice',
    status: 'new',
    adminNotes: null,
    failureClassification: null,
    remediationStatus: null,
    remediationOpenedAt: null,
    remediationOpenedByUserId: null,
    remediationResolvedAt: null,
    remediationResolvedByUserId: null,
    ...overrides,
  };
}

function createAdminDeps(overrides: Record<string, unknown> = {}) {
  const feedbackRepo = {
    nextId: vi.fn(async () => 'feedback-1'),
    insert: vi.fn(async () => undefined),
    getById: vi.fn(async () => null),
    listByEntry: vi.fn(async () => []),
    listByStatus: vi.fn(async () => []),
    listByFilter: vi.fn(async () => []),
    update: vi.fn(async () => undefined),
  };
  return {
    feedbackRepo,
    knowledgeRead: {
      getById: vi.fn(async (entryId: string) => ({
        id: entryId,
        shortcut: 'trap-one',
        detail: 'trap detail',
        lifecycleState: 'approved',
      })),
    },
    artifactReadProjection: {
      getById: vi.fn(async () => null),
      listByFilter: vi.fn(async () => []),
      listForRetrieval: vi.fn(async () => []),
      history: vi.fn(async () => []),
      exportArtifacts: vi.fn(async () => []),
      reviewQueue: vi.fn(async () => []),
    },
    knowledgeWrite: {
      applyDecayDecision: vi.fn(async () => ({ entryId: 'entry-1', action: 'review-due' })),
    },
    jobRuntime: {
      schedule: vi.fn(async () => 'job-1'),
    },
    auditLog: {
      record: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ items: [], total: 0 })),
    },
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    ...overrides,
  };
}

describe('governance review admin module', () => {
  it('filters feedback and returns newest submissions first', async () => {
    const listByFilter = vi.fn(async () => [
      createFeedback({ id: 'fb-1', description: 'old issue' }),
      createFeedback({
        id: 'fb-2',
        description: 'new issue',
        submittedAt: '2026-07-18T01:00:00.000Z',
        submittedByUserId: 'user-2',
        submittedByHandle: 'bob',
      }),
    ]);
    const deps = createAdminDeps();
    deps.feedbackRepo.listByFilter = listByFilter;
    const module = createGovernanceReviewAdminModule(deps);

    const result = await module.list({
      actorId: 'admin-1',
      query: {
        status: ['new'],
        problemType: ['incorrect'],
        entryId: 'entry-1',
        entryType: 'trap',
        limit: 10,
      },
    });

    expect(listByFilter).toHaveBeenCalledWith({
      status: ['new'],
      problemType: ['incorrect'],
      entryId: 'entry-1',
      entryType: 'trap',
    });
    expect(result.items.map((item) => item.id)).toEqual(['fb-2', 'fb-1']);
    expect(result.items[0]?.entryShortcut).toBe('trap-one');
  });

  it('computes quality statistics and recent feedback for an existing entry', async () => {
    const deps = createAdminDeps();
    deps.feedbackRepo.listByEntry = vi.fn(async () => [
      createFeedback({ id: 'fb-old', submittedAt: '2026-07-17T00:00:00.000Z' }),
      createFeedback({
        id: 'fb-new',
        problemType: 'outdated',
        submittedAt: '2026-07-18T00:00:00.000Z',
        status: 'triaged',
      }),
    ]);
    const module = createGovernanceReviewAdminModule(deps);

    const result = await module.stats({ actorId: 'admin-1', entryId: 'entry-1' });

    expect(result.quality).toEqual({
      totalFeedback: 2,
      unresolvedFeedback: 2,
      outdatedReports: 1,
      incorrectReports: 1,
      qualityScore: 0.7,
      lastFeedbackAt: '2026-07-18T00:00:00.000Z',
    });
    expect(result.recentFeedback.map((item) => item.id)).toEqual(['fb-new', 'fb-old']);
  });

  it('reports batch eligibility without writing during a dry run', async () => {
    const deps = createAdminDeps();
    deps.feedbackRepo.getById = vi.fn(async (feedbackId: string) =>
      feedbackId === 'fb-1' ? createFeedback({ id: 'fb-1' }) : null,
    );
    const module = createGovernanceReviewAdminModule(deps);

    const result = await module.batch({
      actorId: 'admin-1',
      command: {
        feedbackIds: ['fb-1', 'missing'],
        action: 'triage',
        dryRun: true,
      },
    });

    expect(result).toMatchObject({
      action: 'triage',
      dryRun: true,
      totalEligible: 1,
      totalIneligible: 1,
      appliedAt: null,
    });
    expect(result.items).toEqual([
      { feedbackId: 'fb-1', eligible: true, reason: null, transitionApplied: false },
      {
        feedbackId: 'missing',
        eligible: false,
        reason: 'Feedback not found',
        transitionApplied: false,
      },
    ]);
    expect(deps.feedbackRepo.update).not.toHaveBeenCalled();
  });

  it('builds remediation queue items from entries at the active threshold', async () => {
    const deps = createAdminDeps();
    deps.feedbackRepo.listByFilter = vi.fn(async () =>
      Array.from({ length: 10 }, (_, index) =>
        createFeedback({
          id: `fb-${index + 1}`,
          submittedAt: `2026-07-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
        }),
      ),
    );
    const module = createGovernanceReviewAdminModule(deps);

    const result = await module.listRemediation({ actorId: 'admin-1' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      entryId: 'entry-1',
      entryType: 'trap',
      title: 'trap-one',
      unresolvedFeedbackCount: 10,
      sourceSnapshot: { trapDetail: 'trap detail' },
    });
    expect(result.items[0]?.remediation.activeFeedbackIds).toHaveLength(10);
    expect(result.failureClassificationSummary.totalClassified).toBe(0);
  });

  it('returns a remediation detail for an escalated entry', async () => {
    const deps = createAdminDeps();
    deps.feedbackRepo.listByFilter = vi.fn(async () =>
      Array.from({ length: 10 }, (_, index) => createFeedback({ id: `fb-${index + 1}` })),
    );
    const module = createGovernanceReviewAdminModule(deps);

    const result = await module.getRemediation({ actorId: 'admin-1', entryId: 'entry-1' });

    expect(result.item.entryId).toBe('entry-1');
    expect(result.item.remediation.triggeredByFeedbackCount).toBe(10);
  });

  it('resolves active feedback and schedules remediation reactivation', async () => {
    const deps = createAdminDeps();
    const records = Array.from({ length: 10 }, (_, index) =>
      createFeedback({ id: `fb-${index + 1}` }),
    );
    deps.feedbackRepo.listByEntry = vi.fn(async () => records);
    const module = createGovernanceReviewAdminModule(deps);

    const result = await module.completeRemediation({
      actorId: 'admin-1',
      entryId: 'entry-1',
      command: { notes: 'remediation applied' },
    });

    expect(result).toMatchObject({
      entryId: 'entry-1',
      entryType: 'trap',
      resolvedFeedbackIds: records.map((record) => record.id),
      resolvedCount: 10,
      resolvedAt: '2026-07-19T00:00:00.000Z',
      asyncJobId: 'job-1',
    });
    expect(deps.feedbackRepo.update).toHaveBeenCalledTimes(10);
    expect(deps.jobRuntime.schedule).toHaveBeenCalledWith(
      'feedback.remediation-reactivation',
      expect.objectContaining({
        entryId: 'entry-1',
        entryType: 'trap',
        feedbackIds: records.map((record) => record.id),
        resolvedByUserId: 'admin-1',
        notes: 'remediation applied',
      }),
      { dedupeKey: 'feedback.remediation-reactivation:entry-1:2026-07-19T00:00:00.000Z' },
    );
  });

  it('delegates lifecycle transitions after applying an eligible batch', async () => {
    const deps = createAdminDeps();
    const records = [
      createFeedback({ id: 'fb-1', problemType: 'outdated' }),
      createFeedback({ id: 'fb-2', problemType: 'outdated' }),
      createFeedback({ id: 'fb-3', problemType: 'outdated' }),
    ];
    deps.feedbackRepo.getById = vi.fn(
      async (feedbackId: string) => records.find((record) => record.id === feedbackId) ?? null,
    );
    deps.feedbackRepo.listByEntry = vi.fn(async () => records);
    const module = createGovernanceReviewAdminModule(deps);

    await module.batch({
      actorId: 'admin-1',
      command: {
        feedbackIds: records.map((record) => record.id),
        action: 'resolve',
        dryRun: false,
      },
    });

    expect(deps.knowledgeWrite.applyDecayDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'admin-1',
      action: 'stale',
      note: "3 'outdated' feedback in last 30 days",
    });
  });
});
