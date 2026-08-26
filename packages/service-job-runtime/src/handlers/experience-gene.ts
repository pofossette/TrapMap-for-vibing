import type { TaskHandler } from '@trapmap/backend-core';
import {
  type ExperienceGeneDerivationTaskPayload,
  experienceGeneDerivationTaskPayloadSchema,
} from '@trapmap/contracts';

export function createExperienceGeneDerivationTaskHandler(deps: {
  derive(request: ExperienceGeneDerivationTaskPayload): Promise<unknown>;
}): TaskHandler<ExperienceGeneDerivationTaskPayload> {
  return {
    type: 'experience-gene.derive',
    async handle(task) {
      const request = experienceGeneDerivationTaskPayloadSchema.parse(task.payload);
      await deps.derive(request);
    },
  };
}
