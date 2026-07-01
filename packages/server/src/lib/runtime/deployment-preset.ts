import type { RuntimeMode } from './runtime-contract.js';
import type { ServiceUnit } from './service-unit.js';

export type DeploymentPreset =
  | 'monolith'
  | 'api'
  | 'candidate-worker'
  | 'governance-worker'
  | 'outbox-worker';

// fallow-ignore-next-line unused-type
export interface ResolvedDeploymentPreset {
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
}

function resolveDeploymentPreset(
  preset: DeploymentPreset | undefined,
): ResolvedDeploymentPreset | null {
  switch (preset) {
    case 'api':
      return { runtimeMode: 'api', serviceUnit: 'full-platform' };
    case 'candidate-worker':
      return { runtimeMode: 'task-worker', serviceUnit: 'candidate-ingestion' };
    case 'governance-worker':
      return { runtimeMode: 'task-worker', serviceUnit: 'knowledge-governance' };
    case 'outbox-worker':
      return { runtimeMode: 'outbox-worker', serviceUnit: 'knowledge-governance' };
    case 'monolith':
      return { runtimeMode: 'combined', serviceUnit: 'full-platform' };
    default:
      return null;
  }
}
