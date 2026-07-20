import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeOwnerPort } from '@trapmap/contracts';
import type { GovernanceReviewPgOwnerBundle } from '@trapmap/service-governance-review';

import {
  createHostLocalGovernanceConflictTaskHandlers,
  createHostLocalGovernanceTaskHandlers,
  createHostLocalGovernanceConflictWorkflow,
} from './governance-composition.js';

describe('host-local governance composition', () => {
  it('connects the knowledge owner read projection to governance conflict persistence', async () => {
    const owner: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter'> = {
      getById: vi.fn().mockResolvedValue({
        id: 'entry-new',
        shortcut: 'Postgres query timeout',
        detail: 'avoid table scan',
        lifecycleState: 'approved',
      }),
      listByFilter: vi.fn().mockResolvedValue([
        {
          id: 'entry-old',
          shortcut: 'Postgres query timeout',
          detail: 'use index planner',
          lifecycleState: 'approved',
        },
      ]),
    } as never;
    const conflictProjection: GovernanceReviewPgOwnerBundle['conflictProjection'] = {
      listByEntryIds: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
    };

    const workflow = createHostLocalGovernanceConflictWorkflow({
      knowledgeOwner: owner,
      conflictProjection,
      createId: () => 'conflict-1',
      now: () => '2026-07-18T00:00:00.000Z',
    });

    await expect(workflow.detectConflicts({ entryId: 'entry-new' })).resolves.toEqual({
      detectedCount: 1,
    });
    expect(owner.getById).toHaveBeenCalledWith('entry-new');
    expect(owner.listByFilter).toHaveBeenCalledWith({ lifecycleState: 'approved' });
    expect(conflictProjection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conflict-1',
        entryIdA: 'entry-new',
        entryIdB: 'entry-old',
      }),
    );
  });

  it('registers a handler that invokes the composed governance workflow', async () => {
    const detectConflicts = vi.fn().mockResolvedValue({ detectedCount: 0 });
    const [handler] = createHostLocalGovernanceConflictTaskHandlers({ detectConflicts });

    await handler.handle(
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

  it('combines conflict and governance feedback handlers without creating a queue', async () => {
    const asyncCommands = {
      reactivateRemediation: vi.fn().mockResolvedValue(undefined),
      exportBadcaseDraft: vi.fn().mockResolvedValue(undefined),
    };
    const handlers = createHostLocalGovernanceTaskHandlers(
      { detectConflicts: vi.fn().mockResolvedValue({ detectedCount: 0 }) },
      asyncCommands,
    );

    expect(handlers.map((handler) => handler.type)).toEqual([
      'governance.conflict-detection',
      'feedback.remediation-reactivation',
      'feedback.badcase-export-draft',
    ]);

    await handlers[1]!.handle(
      {
        id: 'task-2',
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
    await handlers[2]!.handle(
      {
        id: 'task-3',
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

    expect(asyncCommands.reactivateRemediation).toHaveBeenCalledOnce();
    expect(asyncCommands.exportBadcaseDraft).toHaveBeenCalledOnce();
  });
});
