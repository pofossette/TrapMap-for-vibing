import { describe, expect, it, vi } from 'vitest';

import type { GovernanceConflictWorkflowPort } from '@trapmap/backend-core';

import { createGovernanceConflictTaskHandler } from './governance-conflict.js';

describe('governance conflict task handler', () => {
  it('validates the payload and invokes the governance workflow', async () => {
    const workflow: GovernanceConflictWorkflowPort = {
      detectConflicts: vi.fn().mockResolvedValue({ detectedCount: 1 }),
    };
    const handler = createGovernanceConflictTaskHandler(workflow);

    await handler.handle(
      {
        id: 'task-1',
        type: 'governance.conflict-detection',
        payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
        attempt: 1,
      },
      new AbortController().signal,
    );

    expect(workflow.detectConflicts).toHaveBeenCalledWith({ entryId: 'entry-1' });
  });

  it('propagates workflow dependency failures', async () => {
    const failure = new Error('projection unavailable');
    const workflow: GovernanceConflictWorkflowPort = {
      detectConflicts: vi.fn().mockRejectedValue(failure),
    };
    const handler = createGovernanceConflictTaskHandler(workflow);

    await expect(
      handler.handle(
        {
          id: 'task-1',
          type: 'governance.conflict-detection',
          payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
          attempt: 1,
        },
        new AbortController().signal,
      ),
    ).rejects.toBe(failure);
  });
});
