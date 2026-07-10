import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import { getStorePool } from '@trapmap/server/lib/store.js';
import { createSharedJobQueuePort, scheduleSharedJob } from './index.js';
import { SKILL_INDEX_FOLLOW_UP_TASK_TYPE, type SkillIndexFollowUpPayload } from './types.js';

export async function runOrScheduleSkillIndexFollowUp(args: {
  services: Pick<SkillShareerServices, 'store' | 'ai' | 'graphQueryBackend' | 'asyncTransport'>;
  payload: SkillIndexFollowUpPayload;
}): Promise<void> {
  const { services, payload } = args;

  if (getStorePool(services.store)) {
    const queue = services.asyncTransport?.task
      ? createSharedJobQueuePort(services.asyncTransport.task)
      : undefined;
    await scheduleSharedJob(
      queue,
      services.store,
      SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
      payload,
      `${SKILL_INDEX_FOLLOW_UP_TASK_TYPE}:${payload.artifactId}:${payload.previousState}:${payload.nextState}:${payload.reason}`,
    );
    return;
  }

  await runSkillIndexEvent({
    services: {
      store: services.store,
      data: await services.store.snapshot(),
      ai: { chat: services.ai.chat },
      graphQueryBackend: services.graphQueryBackend,
    },
    artifactId: payload.artifactId,
    previousState: payload.previousState,
    nextState: payload.nextState,
    reason: payload.reason,
  });
}
