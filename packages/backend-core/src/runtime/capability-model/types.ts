/**
 * Runtime capability model for TrapMap backend — type definitions.
 *
 * These types define the host-agnostic deployment configuration and capability
 * resolution system. They are the single source of truth for how a runtime
 * instance is configured, independent of whether it runs inside Fastify,
 * a CLI process, or a distributed worker.
 *
 * Extracted from `packages/server/src/lib/runtime/` to be shared by all host assemblies.
 */

import type { DeploymentProfile } from '@trapmap/contracts';

export type { DeploymentProfile } from '@trapmap/contracts';

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

// ---------------------------------------------------------------------------
// Deployment preset resolution
// ---------------------------------------------------------------------------

export interface ResolvedDeploymentPreset {
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
}
