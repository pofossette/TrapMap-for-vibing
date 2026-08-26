import type { QueuePorts } from '@trapmap/backend-core';
import {
  EXPERIENCE_GENE_DERIVE_TASK_EVENT,
  type ExperienceGeneDerivationTaskPayload,
  type ExperienceGeneMode,
  experienceGeneSourceLifecycleEventSchema,
} from '@trapmap/contracts';
import type { JobRuntimeOutboxHandler } from '../outbox-worker.js';

const EXPERIENCE_GENE_SOURCE_EVENT_NAMES = [
  'knowledge.approved',
  'knowledge.lifecycle-updated',
  'knowledge.rejected',
  'knowledge.remediation',
  'artifact.approved',
  'artifact.lifecycle-updated',
  'artifact.deactivated',
] as const;

export function createExperienceGeneOutboxHandlers(
  queuePorts: Pick<QueuePorts, 'task'>,
  params: {
    mode: ExperienceGeneMode;
    markStale(event: unknown): Promise<unknown>;
    plan(event: unknown): Promise<ExperienceGeneDerivationTaskPayload[]>;
  },
): JobRuntimeOutboxHandler[] {
  if (params.mode === 'off') return [];

  return EXPERIENCE_GENE_SOURCE_EVENT_NAMES.map((eventName) => ({
    eventName,
    async handle(payload: unknown) {
      let event: unknown = payload;
      if (payload && typeof payload === 'object' && 'name' in payload) {
        const name = payload.name;
        if (typeof name !== 'string') {
          throw new Error('experience gene source event is missing a string name');
        }
        if (name !== 'knowledge.remediation') {
          event = experienceGeneSourceLifecycleEventSchema.parse(payload);
        }
      }
      await params.markStale(event);
      if (typeof event !== 'object' || event === null || !('nextState' in event)) return;
      const tasks = await params.plan(event);
      await Promise.all(
        tasks.map((task) =>
          queuePorts.task.enqueue(EXPERIENCE_GENE_DERIVE_TASK_EVENT, task, {
            dedupeKey: `${EXPERIENCE_GENE_DERIVE_TASK_EVENT}:${task.requestId}`,
          }),
        ),
      );
    },
  }));
}
