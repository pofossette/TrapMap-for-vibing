import { describe, expect, it, vi } from 'vitest';

import { createGovernanceConflictTaskScheduler } from './index.ts';

function makeEvent(overrides?: Record<string, unknown>) {
  return {
    name: 'knowledge.approved',
    entryId: 'entry-1',
    previousState: 'agent-pass',
    nextState: 'approved',
    actorId: 'user-1',
    reason: 'test',
    timestamp: '2026-05-07T00:00:00.000Z',
    metadata: { sourceEventId: 'event-1' },
    ...overrides,
  };
}

describe('createGovernanceConflictTaskScheduler', () => {
  it('schedules governance conflict detection for approved lifecycle events', async () => {
    const schedule = vi.fn().mockResolvedValue('job-1');
    const handler = createGovernanceConflictTaskScheduler({ schedule });

    await handler(makeEvent());

    expect(schedule).toHaveBeenCalledWith(
      'governance.conflict-detection',
      { entryId: 'entry-1', sourceEventId: 'event-1' },
      { dedupeKey: 'governance.conflict-detection:entry-1:event-1' },
    );
  });

  it('ignores lifecycle events that do not move to approved', async () => {
    const schedule = vi.fn().mockResolvedValue('job-1');
    const handler = createGovernanceConflictTaskScheduler({ schedule });

    await handler(makeEvent({ nextState: 'rejected' }));

    expect(schedule).not.toHaveBeenCalled();
  });

  it('falls back to a stable source event id when metadata does not provide one', async () => {
    const schedule = vi.fn().mockResolvedValue('job-1');
    const handler = createGovernanceConflictTaskScheduler({ schedule });

    await handler(makeEvent({ metadata: { sourceEventId: 42 } }));

    const sourceEventId = 'knowledge.approved:entry-1:2026-05-07T00:00:00.000Z';
    expect(schedule).toHaveBeenCalledWith(
      'governance.conflict-detection',
      { entryId: 'entry-1', sourceEventId },
      { dedupeKey: `governance.conflict-detection:entry-1:${sourceEventId}` },
    );
  });
});
