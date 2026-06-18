/**
 * Runtime capability model for TrapMap backend.
 *
 * These types define the host-agnostic deployment configuration and capability
 * resolution system. They are the single source of truth for how a runtime
 * instance is configured, independent of whether it runs inside Fastify,
 * a CLI process, or a distributed worker.
 *
 * Extracted from `packages/server/src/lib/runtime/` to be shared by all host assemblies.
 */

// ---------------------------------------------------------------------------
// Primitive enum types
// ---------------------------------------------------------------------------

export type DeploymentProfile = 'local-agent' | 'team-monolith' | 'distributed';

export type DeploymentProfileSource = 'explicit' | 'inferred';

export type DeploymentRouteSurface = 'minimal-agent' | 'gateway-core' | 'worker-status';

export type DeploymentAsyncOwnershipExpectation = 'local-owned' | 'split-owned' | 'remote-expected';

export type DeploymentStoragePosture = 'json-store-ok' | 'postgres-required';

export type DeploymentAuthTeamExpectation = 'single-user' | 'team-auth';

export type DeploymentPreset =
  | 'monolith'
  | 'api'
  | 'candidate-worker'
  | 'governance-worker'
  | 'outbox-worker';

export type RuntimeMode = 'api' | 'task-worker' | 'outbox-worker' | 'combined';

export type AsyncWorkerKind = 'queue' | 'outbox';

export type ServiceUnit = 'full-platform' | 'candidate-ingestion' | 'knowledge-governance';

// ---------------------------------------------------------------------------
// Composite interfaces
// ---------------------------------------------------------------------------

export interface RuntimeModeConfig {
  mode: RuntimeMode;
}

export interface RuntimeWorkerHandle {
  isRunning(): boolean;
  ownsWork(): boolean;
  stop(): Promise<void> | void;
}

export interface RuntimeWorkerSnapshot {
  owner: boolean | undefined;
  running: boolean;
}

export interface ServiceUnitProfile {
  name: ServiceUnit;
  ownsCandidateTaskWork: boolean;
  ownsSharedJobTaskWork: boolean;
  ownsOutboxWork: boolean;
}

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

// ---------------------------------------------------------------------------
// Runtime mode boot logic
// ---------------------------------------------------------------------------

export function shouldBootApiRuntime(mode: RuntimeMode): boolean {
  return mode === 'api' || mode === 'combined';
}

export function shouldBootTaskWorker(mode: RuntimeMode): boolean {
  return mode === 'task-worker' || mode === 'combined';
}

export function shouldBootOutboxWorker(mode: RuntimeMode): boolean {
  return mode === 'outbox-worker' || mode === 'combined';
}

export function shouldOwnAsyncWork(mode: RuntimeMode, workerKind: AsyncWorkerKind): boolean {
  return workerKind === 'queue' ? shouldBootTaskWorker(mode) : shouldBootOutboxWorker(mode);
}

export function snapshotRuntimeWorker(
  worker: RuntimeWorkerHandle | null | undefined,
): RuntimeWorkerSnapshot {
  return {
    owner: worker?.ownsWork?.(),
    running: worker?.isRunning?.() ?? false,
  };
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

export interface ResolvedDeploymentPreset {
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
}

export function resolveDeploymentPreset(
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

// ---------------------------------------------------------------------------
// Capability resolution
// ---------------------------------------------------------------------------

function resolveDeploymentCapabilities(
  deploymentProfile: DeploymentProfile,
  runtimeMode: RuntimeMode,
  serviceUnit: ServiceUnit,
): DeploymentCapabilities {
  const taskRuntime = runtimeMode === 'task-worker' || runtimeMode === 'combined';
  const outboxRuntime = runtimeMode === 'outbox-worker' || runtimeMode === 'combined';
  const workerStatusOnly = runtimeMode === 'task-worker' || runtimeMode === 'outbox-worker';
  const ownsCandidateTaskWork = serviceUnit === 'full-platform' || serviceUnit === 'candidate-ingestion';
  const ownsSharedJobTaskWork = serviceUnit === 'full-platform' || serviceUnit === 'knowledge-governance';
  const ownsOutboxWork = serviceUnit === 'full-platform' || serviceUnit === 'knowledge-governance';

  if (deploymentProfile === 'local-agent') {
    return {
      routeSurface: workerStatusOnly ? 'worker-status' : 'minimal-agent',
      asyncOwnershipExpectation: 'local-owned',
      storagePosture: 'json-store-ok',
      authTeamExpectation: 'single-user',
      exposesGateway: !workerStatusOnly,
      exposesFullHttpApi: false,
      supportsLocalSingleUserMode: true,
      supportsJsonStore: true,
      requiresPostgres: false,
      requiresGateway: true,
      requiresAsyncOwnership: false,
      allowsSingleProcess: true,
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
      supportsReviewGovernance: false,
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

  // team-monolith (default)
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
        capabilities: resolveDeploymentCapabilities('distributed', 'task-worker', 'candidate-ingestion'),
      };
    case 'governance-worker':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'task-worker',
        serviceUnit: 'knowledge-governance',
        capabilities: resolveDeploymentCapabilities('distributed', 'task-worker', 'knowledge-governance'),
      };
    case 'outbox-worker':
      return {
        deploymentProfile: 'distributed',
        profileSource: 'inferred',
        preset: normalizedPreset,
        runtimeMode: 'outbox-worker',
        serviceUnit: 'knowledge-governance',
        capabilities: resolveDeploymentCapabilities('distributed', 'outbox-worker', 'knowledge-governance'),
      };
    case 'monolith':
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
    case 'team-monolith':
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
    minimumPreset:
      resolved.deploymentProfile === 'distributed' ? 'api' : 'monolith',
  };
}

// ---------------------------------------------------------------------------
// Async worker ownership resolution
// ---------------------------------------------------------------------------

export type AsyncWorkerDependencyState = 'not-configured' | 'running' | 'degraded' | 'remote';

export interface ResolveAsyncWorkerStateOptions {
  database: 'postgres' | 'json-store';
  runtimeMode: RuntimeMode;
  workerKind: AsyncWorkerKind;
  worker?: RuntimeWorkerHandle | null;
  owner?: boolean | undefined;
  running?: boolean;
}

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
