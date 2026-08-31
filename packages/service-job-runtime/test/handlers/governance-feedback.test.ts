import { describe, expect, it, vi } from 'vitest';

import {
  createGovernanceBadcaseExportDraftTaskHandler,
  createGovernanceRemediationTaskHandler,
} from '../../src/handlers/governance-feedback.js';

const remediationPayload = {
  entryId: 'entry-1',
  entryType: 'trap' as const,
  feedbackIds: ['feedback-1'],
  resolvedAt: '2026-07-20T00:00:00.000Z',
  resolvedByUserId: 'admin-1',
  notes: 'reindex after remediation',
};

const badcasePayload = {
  feedbackId: 'feedback-1',
  entryId: 'entry-1',
  entryType: 'trap' as const,
  queryId: 'query-1',
  requestId: 'request-1',
  traceId: 'trace-1',
};

describe('governance feedback task handlers', () => {
  it('validates and delegates remediation reactivation to the governance owner', async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const handler = createGovernanceRemediationTaskHandler({
      reactivateRemediation: command,
    });

    await handler.handle(
      {
        id: 'task-1',
        type: 'feedback.remediation-reactivation',
        payload: remediationPayload,
        attempt: 2,
      },
      new AbortController().signal,
    );

    expect(command).toHaveBeenCalledWith(remediationPayload);
  });

  it('validates and delegates badcase export to the governance owner with correlation fields', async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const handler = createGovernanceBadcaseExportDraftTaskHandler({
      exportBadcaseDraft: command,
    });

    await handler.handle(
      {
        id: 'task-2',
        type: 'feedback.badcase-export-draft',
        payload: badcasePayload,
        attempt: 1,
      },
      new AbortController().signal,
    );

    expect(command).toHaveBeenCalledWith(badcasePayload);
  });

  it('rejects an invalid remediation payload before invoking the owner', async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const handler = createGovernanceRemediationTaskHandler({
      reactivateRemediation: command,
    });

    await expect(
      handler.handle(
        {
          id: 'task-3',
          type: 'feedback.remediation-reactivation',
          payload: { ...remediationPayload, feedbackIds: [] },
          attempt: 1,
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(command).not.toHaveBeenCalled();
  });

  it('propagates a governance owner failure', async () => {
    const failure = new Error('governance owner unavailable');
    const command = vi.fn().mockRejectedValue(failure);
    const handler = createGovernanceBadcaseExportDraftTaskHandler({
      exportBadcaseDraft: command,
    });

    await expect(
      handler.handle(
        {
          id: 'task-4',
          type: 'feedback.badcase-export-draft',
          payload: badcasePayload,
          attempt: 1,
        },
        new AbortController().signal,
      ),
    ).rejects.toBe(failure);
  });
});
