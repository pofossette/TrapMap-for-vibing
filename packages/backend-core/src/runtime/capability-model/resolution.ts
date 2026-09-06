/**
 * Capability resolution: deployment preset/profile → runtime mode, service unit,
 * and the derived capability matrix. Public entry point is `resolveRuntimeDeployment`.
 */

import { shouldOwnAsyncWork, snapshotRuntimeWorker } from './boot.js';
import type {
  AsyncWorkerDependencyState,
  DeploymentCapabilities,
  DeploymentPreset,
  DeploymentProfile,
  DeploymentProfileCompatibility,
  ResolveAsyncWorkerStateOptions,
  ResolvedDeploymentPreset,
  ResolvedRuntimeDeployment,
  RuntimeMode,
  RuntimeWorkerSnapshot,
  ServiceUnit,
  ServiceUnitProfile,
} from './types.js';

export function resolveAsyncWorkerState(
  args: ResolveAsyncWorkerStateOptions,
): AsyncWorkerDependencyState {
  if (args.database === 'json-store') {
    return 'not-configured';
  }

  const snapshot: RuntimeWorkerSnapshot =
    args.worker === undefined
      ? { owner: args.owner, running: args.running ?? false }
      : snapshotRuntimeWorker(args.worker);

  if (!shouldOwnAsyncWork(args.runtimeMode, args.workerKind) || snapshot.owner === false) {
    return 'remote';
  }

  return snapshot.running ? 'running' : 'degraded';
}

// ---------------------------------------------------------------------------
// Service unit resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Deployment preset resolution
// ---------------------------------------------------------------------------

export function resolveDeploymentPreset(
  preset: DeploymentPreset | undefined,
): ResolvedDeploymentPreset | null {
  if (!preset) return null;
  return resolveDeploymentPresetShape(preset);
}

// ---------------------------------------------------------------------------
// Capability resolution
// ---------------------------------------------------------------------------

// fallow-ignore-next-line complexity -- Task A8 机械移动的既有实现体（原 capability-model.ts 同体量）；行为不变硬约束下不拆函数体
function resolveDeploymentCapabilities(
  deploymentProfile: DeploymentProfile,
  runtimeMode: RuntimeMode,
  serviceUnit: ServiceUnit,
): DeploymentCapabilities {
  const taskRuntime = runtimeMode === 'task-worker' || runtimeMode === 'combined';
  const outboxRuntime = runtimeMode === 'outbox-worker' || runtimeMode === 'combined';
  const workerStatusOnly = runtimeMode === 'task-worker' || runtimeMode === 'outbox-worker';
  const ownsCandidateTaskWork =
    serviceUnit === 'full-platform' || serviceUnit === 'candidate-ingestion';
  const ownsSharedJobTaskWork =
    serviceUnit === 'full-platform' || serviceUnit === 'knowledge-governance';
  const ownsOutboxWork = serviceUnit === 'full-platform' || serviceUnit === 'knowledge-governance';

  if (deploymentProfile === 'local-agent') {
    return {
      routeSurface: workerStatusOnly ? 'worker-status' : 'gateway-core',
      asyncOwnershipExpectation: 'local-owned',
      storagePosture: 'json-store-ok',
      authTeamExpectation: 'single-user',
      exposesGateway: !workerStatusOnly,
      exposesFullHttpApi: !workerStatusOnly,
      supportsLocalSingleUserMode: true,
      requiresPostgres: false,
      requiresGateway: true,
      requiresAsyncOwnership: false,
      allowsSingleProcess: true,
      ownsCandidateTaskWork,
      ownsSharedJobTaskWork,
      ownsOutboxWork,
      supportsReviewGovernance: !workerStatusOnly,
      supportsTeamAuth: false,
      supportsDistributedRouting: false,
    };
  }

  if (deploymentProfile === 'distributed') {
    return {
      routeSurface: workerStatusOnly ? 'worker-status' : 'gateway-core',
      asyncOwnershipExpectation: 'remote-expected',
      storagePosture: 'postgres-required',
      authTeamExpectation: 'team-auth',
      exposesGateway: !workerStatusOnly,
      exposesFullHttpApi: !workerStatusOnly,
      supportsLocalSingleUserMode: false,
      requiresPostgres: true,
      requiresGateway: true,
      requiresAsyncOwnership: true,
      allowsSingleProcess: false,
      ownsCandidateTaskWork,
      ownsSharedJobTaskWork,
      ownsOutboxWork,
      supportsReviewGovernance: !workerStatusOnly,
      supportsTeamAuth: !workerStatusOnly,
      supportsDistributedRouting: true,
    };
  }

  // team-monolith (default)
  return {
    routeSurface: workerStatusOnly ? 'worker-status' : 'gateway-core',
    asyncOwnershipExpectation: taskRuntime || outboxRuntime ? 'split-owned' : 'local-owned',
    storagePosture: 'postgres-required',
    authTeamExpectation: 'team-auth',
    exposesGateway: !workerStatusOnly,
    exposesFullHttpApi: !workerStatusOnly,
    supportsLocalSingleUserMode: false,
    requiresPostgres: true,
    requiresGateway: true,
    requiresAsyncOwnership: taskRuntime || outboxRuntime,
    allowsSingleProcess: true,
    ownsCandidateTaskWork,
    ownsSharedJobTaskWork,
    ownsOutboxWork,
    supportsReviewGovernance: !workerStatusOnly,
    supportsTeamAuth: !workerStatusOnly,
    supportsDistributedRouting: false,
  };
}

function resolveDeploymentPresetShape(
  preset: DeploymentPreset,
): Pick<ResolvedRuntimeDeployment, 'runtimeMode' | 'serviceUnit'> {
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
      return { runtimeMode: 'combined', serviceUnit: 'full-platform' };
  }
}

function withRuntimeOverrides(
  resolved: ResolvedRuntimeDeployment,
  overrides: {
    runtimeMode?: RuntimeMode;
    serviceUnit?: ServiceUnit;
  },
): ResolvedRuntimeDeployment {
  const runtimeMode = overrides.runtimeMode ?? resolved.runtimeMode;
  const serviceUnit = overrides.serviceUnit ?? resolved.serviceUnit;

  if (runtimeMode === resolved.runtimeMode && serviceUnit === resolved.serviceUnit) {
    return resolved;
  }

  return {
    ...resolved,
    runtimeMode,
    serviceUnit,
    capabilities: resolveDeploymentCapabilities(
      resolved.deploymentProfile,
      runtimeMode,
      serviceUnit,
    ),
  };
}

// fallow-ignore-next-line complexity -- Task A8 机械移动的既有实现体（原 capability-model.ts 同体量）；行为不变硬约束下不拆函数体
function inferDeploymentProfileFromPreset(
  preset: DeploymentPreset | undefined,
): ResolvedRuntimeDeployment {
  const normalizedPreset: DeploymentPreset = preset ?? 'monolith';
  switch (preset) {
    case 'api':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'api',
        serviceUnit: 'full-platform',
        capabilities: resolveDeploymentCapabilities('distributed', 'api', 'full-platform'),
      };
    case 'candidate-worker':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'task-worker',
        serviceUnit: 'candidate-ingestion',
        capabilities: resolveDeploymentCapabilities(
          'distributed',
          'task-worker',
          'candidate-ingestion',
        ),
      };
    case 'governance-worker':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'task-worker',
        serviceUnit: 'knowledge-governance',
        capabilities: resolveDeploymentCapabilities(
          'distributed',
          'task-worker',
          'knowledge-governance',
        ),
      };
    case 'outbox-worker':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'outbox-worker',
        serviceUnit: 'knowledge-governance',
        capabilities: resolveDeploymentCapabilities(
          'distributed',
          'outbox-worker',
          'knowledge-governance',
        ),
      };
    default:
      return {
        deploymentProfile: 'team-monolith',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'combined',
        serviceUnit: 'full-platform',
        capabilities: resolveDeploymentCapabilities('team-monolith', 'combined', 'full-platform'),
      };
  }
}

// ---------------------------------------------------------------------------
// Public resolution entry point
// ---------------------------------------------------------------------------

export function resolveRuntimeDeployment(args: {
  profile: DeploymentProfile | undefined;
  preset: DeploymentPreset | undefined;
  runtimeMode?: RuntimeMode;
  serviceUnit?: ServiceUnit;
}): ResolvedRuntimeDeployment {
  if (!args.profile) {
    return withRuntimeOverrides(inferDeploymentProfileFromPreset(args.preset), {
      ...(args.runtimeMode !== undefined ? { runtimeMode: args.runtimeMode } : {}),
      ...(args.serviceUnit !== undefined ? { serviceUnit: args.serviceUnit } : {}),
    });
  }

  const preset = args.preset ?? 'monolith';
  const presetResolution = resolveDeploymentPresetShape(preset);
  const runtimeMode = args.runtimeMode ?? presetResolution.runtimeMode;
  const serviceUnit = args.serviceUnit ?? presetResolution.serviceUnit;

  switch (args.profile) {
    case 'local-agent':
      return {
        deploymentProfile: 'local-agent',
        profileSource: 'explicit',
        preset,
        runtimeMode,
        serviceUnit,
        capabilities: resolveDeploymentCapabilities('local-agent', runtimeMode, serviceUnit),
      };
    case 'distributed':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'explicit',
        preset,
        runtimeMode,
        serviceUnit,
        capabilities: resolveDeploymentCapabilities('distributed', runtimeMode, serviceUnit),
      };
    default:
      return {
        deploymentProfile: 'team-monolith',
        profileSource: 'explicit',
        preset,
        runtimeMode,
        serviceUnit,
        capabilities: resolveDeploymentCapabilities('team-monolith', runtimeMode, serviceUnit),
      };
  }
}

export function resolveDeploymentProfileCompatibility(args: {
  profile: DeploymentProfile | undefined;
  preset: DeploymentPreset | undefined;
}): DeploymentProfileCompatibility {
  const resolved = resolveRuntimeDeployment(args);
  const requiresAsyncOwnership = resolved.deploymentProfile === 'distributed';
  const allowsSingleProcess = resolved.deploymentProfile !== 'distributed';
  const requiresPostgres = resolved.deploymentProfile !== 'local-agent';

  return {
    profile: resolved.deploymentProfile,
    source: resolved.profileSource,
    requiresGateway: true,
    requiresAsyncOwnership,
    allowsSingleProcess,
    requiresPostgres,
    minimumPreset: resolved.deploymentProfile === 'distributed' ? 'api' : 'monolith',
  };
}
