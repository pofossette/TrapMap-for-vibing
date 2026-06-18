import type { DeploymentProfile, ResolvedRuntimeDeployment } from './deployment-profile.js';
import type { RouteFamilyDescriptor, RouteFamilyKind } from './route-surface.js';
import type { RuntimeMode } from './runtime-contract.js';
import type { ServiceUnit, ServiceUnitProfile } from './service-unit.js';

export type TopologyServiceName =
  | 'gateway'
  | 'retrieval'
  | 'candidate-ingestion'
  | 'governance'
  | 'outbox-runtime';

export type TopologySurface = 'gateway-public' | 'internal-api' | 'worker-internal' | 'status-only';
export type TopologyRuntimeBoundary = 'dedicated-runtime' | 'logical-service-boundary';
export type TopologyOwnershipMode = 'local-only' | 'remote-owner-expected' | 'local-worker-owned';

export interface TopologyServiceDescriptor {
  name: TopologyServiceName;
  surface: TopologySurface;
  runtimeBoundary: TopologyRuntimeBoundary;
  responsibilities: readonly string[];
  routeFamilies: readonly RouteFamilyKind[];
  ownsCandidateTaskWork: boolean;
  ownsSharedJobTaskWork: boolean;
  ownsOutboxWork: boolean;
  ownershipMode: TopologyOwnershipMode;
  notes?: string;
}

export interface ServiceTopologySnapshot {
  deploymentProfile: DeploymentProfile;
  phase: 'shared-postgres-phase1';
  currentService: TopologyServiceDescriptor;
  distributedServices: readonly TopologyServiceDescriptor[];
  sharedInfrastructure: readonly string[];
  deferredIsolationBoundaries: readonly string[];
}

const SHARED_INFRASTRUCTURE = [
  'postgresql',
  'shared-contracts',
  'auth-session-model',
  'queue-outbox-semantics',
] as const;

const DEFERRED_ISOLATION_BOUNDARIES = [
  'per-service-database',
  'split-repository-packages',
  'service-mesh-event-backbone',
] as const;

const DISTRIBUTED_SERVICES: readonly TopologyServiceDescriptor[] = [
  {
    name: 'gateway',
    surface: 'gateway-public',
    runtimeBoundary: 'dedicated-runtime',
    responsibilities: [
      'Public CLI/API entrypoint',
      'Authentication and session handling',
      'Routing to retrieval and governance surfaces',
    ],
    routeFamilies: ['gateway-api'],
    ownsCandidateTaskWork: false,
    ownsSharedJobTaskWork: false,
    ownsOutboxWork: false,
    ownershipMode: 'remote-owner-expected',
  },
  {
    name: 'retrieval',
    surface: 'internal-api',
    runtimeBoundary: 'logical-service-boundary',
    responsibilities: [
      'Search and retrieval orchestration',
      'Read-model composition and capsule recall',
      'Read-side query execution without governance writes',
    ],
    routeFamilies: ['gateway-api'],
    ownsCandidateTaskWork: false,
    ownsSharedJobTaskWork: false,
    ownsOutboxWork: false,
    ownershipMode: 'remote-owner-expected',
    notes:
      'Phase 1 retrieval is a logical service boundary expressed in gateway/runtime metadata, not a dedicated runtime binary.',
  },
  {
    name: 'candidate-ingestion',
    surface: 'worker-internal',
    runtimeBoundary: 'dedicated-runtime',
    responsibilities: [
      'Candidate submission processing',
      'Deduplication and resolution follow-up',
      'Candidate async task ownership',
    ],
    routeFamilies: [],
    ownsCandidateTaskWork: true,
    ownsSharedJobTaskWork: false,
    ownsOutboxWork: false,
    ownershipMode: 'local-worker-owned',
  },
  {
    name: 'governance',
    surface: 'internal-api',
    runtimeBoundary: 'logical-service-boundary',
    responsibilities: [
      'Knowledge and skill review writes',
      'Maintenance, decay, and feedback remediation commands',
      'Shared-job ownership for governance follow-up',
    ],
    routeFamilies: ['gateway-api'],
    ownsCandidateTaskWork: false,
    ownsSharedJobTaskWork: true,
    ownsOutboxWork: false,
    ownershipMode: 'remote-owner-expected',
    notes:
      'Governance write paths are routed through the gateway today; the service boundary is explicit even when a separate API runtime is not yet emitted.',
  },
  {
    name: 'outbox-runtime',
    surface: 'worker-internal',
    runtimeBoundary: 'dedicated-runtime',
    responsibilities: [
      'Outbox consumption',
      'Derived artifact refresh and follow-up dispatch',
      'Operator-only worker status surface',
    ],
    routeFamilies: ['worker-status'],
    ownsCandidateTaskWork: false,
    ownsSharedJobTaskWork: false,
    ownsOutboxWork: true,
    ownershipMode: 'local-worker-owned',
  },
] as const;

function findDistributedService(name: TopologyServiceName): TopologyServiceDescriptor {
  return DISTRIBUTED_SERVICES.find((service) => service.name === name)!;
}

function resolveCurrentServiceName(args: {
  deployment: ResolvedRuntimeDeployment;
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  serviceUnitProfile: ServiceUnitProfile;
}): TopologyServiceName {
  if (args.deployment.deploymentProfile === 'local-agent') {
    return 'gateway';
  }

  if (args.runtimeMode === 'outbox-worker') {
    return 'outbox-runtime';
  }

  if (args.runtimeMode === 'task-worker') {
    return args.serviceUnit === 'candidate-ingestion' ? 'candidate-ingestion' : 'governance';
  }

  if (args.deployment.deploymentProfile === 'distributed') {
    if (
      args.serviceUnitProfile.ownsCandidateTaskWork &&
      !args.serviceUnitProfile.ownsSharedJobTaskWork &&
      !args.serviceUnitProfile.ownsOutboxWork
    ) {
      return 'candidate-ingestion';
    }

    if (
      !args.serviceUnitProfile.ownsCandidateTaskWork &&
      args.serviceUnitProfile.ownsSharedJobTaskWork
    ) {
      return 'governance';
    }

    return 'gateway';
  }

  if (args.serviceUnit === 'candidate-ingestion') {
    return 'candidate-ingestion';
  }

  if (args.serviceUnit === 'knowledge-governance') {
    return args.runtimeMode === 'api' ? 'governance' : 'outbox-runtime';
  }

  return 'gateway';
}

function buildCurrentServiceDescriptor(args: {
  deployment: ResolvedRuntimeDeployment;
  routeFamilies: readonly RouteFamilyDescriptor[];
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  serviceUnitProfile: ServiceUnitProfile;
}): TopologyServiceDescriptor {
  const name = resolveCurrentServiceName(args);

  if (args.deployment.deploymentProfile === 'local-agent') {
    return {
      name,
      surface: 'gateway-public',
      responsibilities: [
        'Minimal local-agent gateway surface',
        'Retrieval-first single-user workflows',
        'No review governance or remote worker fan-out',
      ],
      routeFamilies: args.routeFamilies.map((family) => family.kind),
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
      runtimeBoundary: 'dedicated-runtime',
      ownershipMode: 'local-only',
      notes:
        'Local-agent trims the gateway to retrieval-first routes and returns capability_unsupported for omitted surfaces.',
    };
  }

  if (args.deployment.deploymentProfile === 'team-monolith') {
    return {
      name,
      surface:
        args.runtimeMode === 'api' || args.runtimeMode === 'combined'
          ? 'gateway-public'
          : 'worker-internal',
      responsibilities: [
        'Single-instance team deployment surface',
        'Gateway and internal services may share one process',
        'Shared PostgreSQL remains the primary store',
      ],
      routeFamilies: args.routeFamilies.map((family) => family.kind),
      ownsCandidateTaskWork: args.serviceUnitProfile.ownsCandidateTaskWork,
      ownsSharedJobTaskWork: args.serviceUnitProfile.ownsSharedJobTaskWork,
      ownsOutboxWork: args.serviceUnitProfile.ownsOutboxWork,
      runtimeBoundary: 'logical-service-boundary',
      ownershipMode:
        args.serviceUnitProfile.ownsCandidateTaskWork ||
        args.serviceUnitProfile.ownsSharedJobTaskWork ||
        args.serviceUnitProfile.ownsOutboxWork
          ? 'local-worker-owned'
          : 'local-only',
      notes:
        'Team-monolith may co-locate gateway, retrieval, governance, and worker ownership inside one process.',
    };
  }

  const base = findDistributedService(name);
  const ownsAnyLocalWork =
    args.serviceUnitProfile.ownsCandidateTaskWork ||
    args.serviceUnitProfile.ownsSharedJobTaskWork ||
    args.serviceUnitProfile.ownsOutboxWork;
  return {
    ...base,
    routeFamilies:
      base.routeFamilies.length > 0
        ? base.routeFamilies
        : args.routeFamilies.map((family) => family.kind),
    ownsCandidateTaskWork: args.serviceUnitProfile.ownsCandidateTaskWork,
    ownsSharedJobTaskWork: args.serviceUnitProfile.ownsSharedJobTaskWork,
    ownsOutboxWork: args.serviceUnitProfile.ownsOutboxWork,
    ownershipMode: ownsAnyLocalWork ? 'local-worker-owned' : base.ownershipMode,
  };
}

export function buildServiceTopologySnapshot(args: {
  deployment: ResolvedRuntimeDeployment;
  routeFamilies: readonly RouteFamilyDescriptor[];
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  serviceUnitProfile: ServiceUnitProfile;
}): ServiceTopologySnapshot {
  return {
    deploymentProfile: args.deployment.deploymentProfile,
    phase: 'shared-postgres-phase1',
    currentService: buildCurrentServiceDescriptor(args),
    distributedServices: DISTRIBUTED_SERVICES,
    sharedInfrastructure: SHARED_INFRASTRUCTURE,
    deferredIsolationBoundaries: DEFERRED_ISOLATION_BOUNDARIES,
  };
}
