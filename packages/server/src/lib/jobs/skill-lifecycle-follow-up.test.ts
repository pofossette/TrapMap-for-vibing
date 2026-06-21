import { describe, expect, it, vi } from 'vitest';

import { scheduleSkillLifecycleFollowUp } from './skill-lifecycle-follow-up.js';

vi.mock('./skill-index-follow-up.js', () => ({
  runOrScheduleSkillIndexFollowUp: vi.fn().mockResolvedValue(undefined),
}));

import { runOrScheduleSkillIndexFollowUp } from './skill-index-follow-up.js';

describe('scheduleSkillLifecycleFollowUp', () => {
  it('skips self transitions', async () => {
    await scheduleSkillLifecycleFollowUp({} as never, {
      artifactId: 'artifact_1',
      previousState: 'approved',
      nextState: 'approved',
      reason: 'updated',
    });

    expect(runOrScheduleSkillIndexFollowUp).not.toHaveBeenCalled();
  });

  it('delegates lifecycle transitions through the shared seam', async () => {
    await scheduleSkillLifecycleFollowUp({} as never, {
      artifactId: 'artifact_1',
      previousState: 'agent-pass',
      nextState: 'approved',
      reason: 'reviewer-approve',
    });

    expect(runOrScheduleSkillIndexFollowUp).toHaveBeenCalledWith({
      services: {},
      payload: {
        artifactId: 'artifact_1',
        previousState: 'agent-pass',
        nextState: 'approved',
        reason: 'reviewer-approve',
      },
    });
  });
});
