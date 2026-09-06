import type { QueuePorts, TaskHandler } from '@trapmap/backend-core';
import type { ExperienceGeneDerivationTaskPayload, ExperienceGeneMode } from '@trapmap/contracts';
import {
  createExperienceGeneDerivationTaskHandler,
  createExperienceGeneOutboxHandlers,
  type JobRuntimeOutboxHandler,
} from '@trapmap/service-job-runtime';

export function createHostLocalExperienceGeneHandlers(params: {
  experienceGeneMode: ExperienceGeneMode;
  derive(request: ExperienceGeneDerivationTaskPayload): Promise<unknown>;
  markStale(event: unknown): Promise<unknown>;
  plan(event: unknown): Promise<ExperienceGeneDerivationTaskPayload[]>;
  queuePorts: Pick<QueuePorts, 'task'>;
}): {
  taskHandler: TaskHandler<unknown> | null;
  outboxHandlers: JobRuntimeOutboxHandler[];
} {
  const outboxHandlers = createExperienceGeneOutboxHandlers(params.queuePorts, {
    mode: params.experienceGeneMode,
    markStale: params.markStale,
    plan: params.plan,
  });

  return {
    taskHandler:
      params.experienceGeneMode === 'off'
        ? null
        : createExperienceGeneDerivationTaskHandler({ derive: params.derive }),
    outboxHandlers,
  };
}
