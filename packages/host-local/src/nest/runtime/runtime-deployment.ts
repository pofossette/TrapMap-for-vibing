import {
  resolveRuntimeDeployment,
  resolveServiceUnit,
  type ResolvedRuntimeDeployment,
} from '@trapmap/backend-core';

import type { HostLocalConfig } from "@trapmap/host-local/nest/config/index.js";

export function resolveHostLocalDeployment(config: HostLocalConfig): ResolvedRuntimeDeployment {
  const runtimeDeployment = resolveRuntimeDeployment({
    preset: config.deployment.preset,
    ...(config.deployment.profile ? { profile: config.deployment.profile } : {}),
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
