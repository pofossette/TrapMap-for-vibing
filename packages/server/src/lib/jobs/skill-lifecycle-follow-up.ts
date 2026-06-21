import type { LifecycleState } from '@trapmap/contracts';

import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { runOrScheduleSkillIndexFollowUp } from './skill-index-follow-up.js';

export interface ScheduleSkillLifecycleFollowUpParams {
  artifactId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
}

export async function scheduleSkillLifecycleFollowUp(
  services: Pick<SkillShareerServices, 'store' | 'ai' | 'graphQueryBackend' | 'asyncTransport'>,
  params: ScheduleSkillLifecycleFollowUpParams,
): Promise<void> {
  if (params.previousState === params.nextState) {
    return;
  }

  await runOrScheduleSkillIndexFollowUp({
    services,
    payload: {
      artifactId: params.artifactId,
      previousState: params.previousState,
      nextState: params.nextState,
      reason: params.reason,
    },
  });
}
