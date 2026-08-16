import {
  type ResolvedRuntimeDeployment,
  resolveRuntimeDeployment,
  resolveServiceUnit,
} from '@trapmap/backend-core';

import type { HostLocalConfig } from '../config/index.js';

export function resolveHostLocalDeployment(config: HostLocalConfig): ResolvedRuntimeDeployment {
  const preset = config.deployment.preset;
  const runtimeDeployment = resolveRuntimeDeployment({
    profile: config.deployment.profile ?? undefined,
    preset: preset === 'cron-scheduler' ? undefined : preset,
    ...(config.deployment.resolved?.runtimeMode
      ? { runtimeMode: config.deployment.resolved.runtimeMode }
      : {}),
    ...(config.deployment.resolved?.serviceUnit
      ? { serviceUnit: resolveServiceUnit(config.deployment.resolved.serviceUnit) }
      : {}),
  });
  config.deployment.resolved = runtimeDeployment;
  return runtimeDeployment;
}
