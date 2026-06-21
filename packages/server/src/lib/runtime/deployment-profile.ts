import type { DeploymentPreset } from './deployment-preset.js';
import type { RuntimeMode } from './runtime-contract.js';
import type { ServiceUnit } from './service-unit.js';

export type DeploymentProfile = 'local-agent' | 'team-monolith' | 'distributed';

export type DeploymentProfileSource = 'explicit' | 'inferred';

export type DeploymentRouteSurface = 'minimal-agent' | 'gateway-core' | 'worker-status';

export type DeploymentAsyncOwnershipExpectation = 'local-owned' | 'split-owned' | 'remote-expected';

export type DeploymentStoragePosture = 'json-store-ok' | 'postgres-required';

export type DeploymentAuthTeamExpectation = 'single-user' | 'team-auth';

export interface DeploymentCapabilities {
  routeSurface: DeploymentRouteSurface;
  asyncOwnershipExpectation: DeploymentAsyncOwnershipExpectation;
  storagePosture: DeploymentStoragePosture;
  authTeamExpectation: DeploymentAuthTeamExpectation;
  exposesGateway: boolean;
  exposesFullHttpApi: boolean;
  supportsLocalSingleUserMode: boolean;
  supportsJsonStore: boolean;
  requiresPostgres: boolean;
  requiresGateway: true;
  requiresAsyncOwnership: boolean;
  allowsSingleProcess: boolean;
  ownsCandidateTaskWork: boolean;
  ownsSharedJobTaskWork: boolean;
  ownsOutboxWork: boolean;
  supportsReviewGovernance: boolean;
  supportsTeamAuth: boolean;
  supportsDistributedRouting: boolean;
}

export interface DeploymentProfileCompatibility {
  profile: DeploymentProfile;
  source: DeploymentProfileSource;
  requiresGateway: true;
  requiresAsyncOwnership: boolean;
  allowsSingleProcess: boolean;
  requiresPostgres: boolean;
  minimumPreset: DeploymentPreset;
}

export interface ResolvedRuntimeDeployment {
  deploymentProfile: DeploymentProfile;
  profileSource: DeploymentProfileSource;
  preset: DeploymentPreset;
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  capabilities: DeploymentCapabilities;
}

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
      supportsJsonStore: true,
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
      supportsJsonStore: false,
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

  return {
    routeSurface: workerStatusOnly ? 'worker-status' : 'gateway-core',
    asyncOwnershipExpectation: taskRuntime || outboxRuntime ? 'split-owned' : 'local-owned',
    storagePosture: 'postgres-required',
    authTeamExpectation: 'team-auth',
    exposesGateway: !workerStatusOnly,
    exposesFullHttpApi: !workerStatusOnly,
    supportsLocalSingleUserMode: false,
    supportsJsonStore: false,
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

function buildResolvedRuntimeDeployment(args: {
  profile?: DeploymentProfile;
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
    default:
      return { runtimeMode: 'combined', serviceUnit: 'full-platform' };
  }
}

export function resolveRuntimeDeployment(args: {
  profile?: DeploymentProfile;
  preset: DeploymentPreset | undefined;
  runtimeMode?: RuntimeMode;
  serviceUnit?: ServiceUnit;
}): ResolvedRuntimeDeployment {
  return buildResolvedRuntimeDeployment(args);
}

export function resolveDeploymentProfileCompatibility(args: {
  profile?: DeploymentProfile;
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
