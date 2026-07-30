import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import { createSharedJobQueuePort, scheduleSharedJob } from './index.js';
import { SKILL_INDEX_FOLLOW_UP_TASK_TYPE, type SkillIndexFollowUpPayload } from './types.js';

export async function runOrScheduleSkillIndexFollowUp(args: {
  services: Pick<
    SkillShareerServices,
    'pool' | 'ai' | 'graphQueryBackend' | 'graphIndex' | 'artifactReadProjection' | 'asyncTransport'
  >;
  payload: SkillIndexFollowUpPayload;
}): Promise<void> {
  const { services, payload } = args;

  if (services.pool) {
    const queue = services.asyncTransport?.task
      ? createSharedJobQueuePort(services.asyncTransport.task)
      : undefined;
    await scheduleSharedJob(
      queue,
      services.pool,
      SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
      payload,
      `${SKILL_INDEX_FOLLOW_UP_TASK_TYPE}:${payload.artifactId}:${payload.previousState}:${payload.nextState}:${payload.reason}`,
    );
    return;
  }

  await runSkillIndexEvent({
    services: {
      pool: services.pool,
      ai: { chat: services.ai.chat },
      ...(services.graphQueryBackend !== undefined
        ? { graphQueryBackend: services.graphQueryBackend }
        : {}),
      graphIndex: services.graphIndex,
      artifactReadProjection: services.artifactReadProjection,
    },
    artifactId: payload.artifactId,
    previousState: payload.previousState,
    nextState: payload.nextState,
    reason: payload.reason,
  });
}
