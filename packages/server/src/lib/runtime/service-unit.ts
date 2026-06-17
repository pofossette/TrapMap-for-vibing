import type { RuntimeMode } from './runtime-contract.js';

export type ServiceUnit = 'full-platform' | 'candidate-ingestion' | 'knowledge-governance';

export interface ServiceUnitProfile {
  name: ServiceUnit;
  ownsCandidateTaskWork: boolean;
  ownsSharedJobTaskWork: boolean;
  ownsOutboxWork: boolean;
}

export function resolveServiceUnit(value: string | undefined | null): ServiceUnit {
  if (
    value === 'candidate-ingestion' ||
    value === 'knowledge-governance' ||
    value === 'full-platform'
  ) {
    return value;
  }
  return 'full-platform';
}

export function getServiceUnitProfile(
  serviceUnit: ServiceUnit,
  runtimeMode: RuntimeMode,
): ServiceUnitProfile {
  const taskRuntime = runtimeMode === 'task-worker' || runtimeMode === 'combined';
  const outboxRuntime = runtimeMode === 'outbox-worker' || runtimeMode === 'combined';

  if (serviceUnit === 'candidate-ingestion') {
    return {
      name: serviceUnit,
      ownsCandidateTaskWork: taskRuntime,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
    };
  }

  if (serviceUnit === 'knowledge-governance') {
    return {
      name: serviceUnit,
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: taskRuntime,
      ownsOutboxWork: outboxRuntime,
    };
  }

  return {
    name: serviceUnit,
    ownsCandidateTaskWork: taskRuntime,
    ownsSharedJobTaskWork: taskRuntime,
    ownsOutboxWork: outboxRuntime,
  };
}
