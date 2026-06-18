import { describe, expect, it } from 'vitest';

import { resolveRuntimeDeployment } from './deployment-profile.js';
import { buildServiceTopologySnapshot } from './service-topology.js';
import { getServiceUnitProfile } from './service-unit.js';

describe('service topology snapshot', () => {
  it('maps local-agent api runtime to a gateway public service with route-family passthrough', () => {
    const deployment = resolveRuntimeDeployment({
      profile: 'local-agent',
      preset: 'monolith',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
    });

    const topology = buildServiceTopologySnapshot({
      deployment,
      routeFamilies: [
        {
          kind: 'local-agent-minimal',
          audience: 'gateway-public',
          description: 'minimal retrieval routes',
          routes: ['POST /v1/retrieval/search'],
        },
      ],
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'api'),
    });

    expect(topology).toMatchObject({
      deploymentProfile: 'local-agent',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
        runtimeBoundary: 'dedicated-runtime',
        ownershipMode: 'local-only',
        routeFamilies: ['local-agent-minimal'],
        ownsCandidateTaskWork: false,
        ownsSharedJobTaskWork: false,
        ownsOutboxWork: false,
      },
    });
  });

  it('maps team-monolith combined runtime to a shared gateway service that keeps local ownership', () => {
    const deployment = resolveRuntimeDeployment({
      profile: 'team-monolith',
      preset: 'monolith',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
    });

    const topology = buildServiceTopologySnapshot({
      deployment,
      routeFamilies: [
        {
          kind: 'gateway-api',
          audience: 'gateway-public',
          description: 'full gateway routes',
          routes: ['GET /v1/auth/session'],
        },
      ],
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
    });

    expect(topology).toMatchObject({
      deploymentProfile: 'team-monolith',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
        runtimeBoundary: 'logical-service-boundary',
        ownershipMode: 'local-worker-owned',
        routeFamilies: ['gateway-api'],
        ownsCandidateTaskWork: true,
        ownsSharedJobTaskWork: true,
        ownsOutboxWork: true,
      },
    });
  });

  it('describes distributed gateway as shared-postgres phase 1 public entrypoint', () => {
    const deployment = resolveRuntimeDeployment({
      profile: 'distributed',
      preset: 'api',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
    });

    const topology = buildServiceTopologySnapshot({
      deployment,
      routeFamilies: [
        {
          kind: 'gateway-api',
          audience: 'gateway-public',
          description: 'gateway routes',
          routes: ['POST /v1/retrieval/search'],
        },
      ],
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'api'),
    });

    expect(topology).toMatchObject({
      deploymentProfile: 'distributed',
      phase: 'shared-postgres-phase1',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
        runtimeBoundary: 'dedicated-runtime',
        ownershipMode: 'remote-owner-expected',
        ownsCandidateTaskWork: false,
        ownsSharedJobTaskWork: false,
        ownsOutboxWork: false,
      },
      sharedInfrastructure: expect.arrayContaining(['postgresql', 'queue-outbox-semantics']),
      deferredIsolationBoundaries: expect.arrayContaining(['per-service-database']),
    });
    expect(topology.distributedServices.map((service) => service.name)).toEqual([
      'gateway',
      'retrieval',
      'candidate-ingestion',
      'governance',
      'outbox-runtime',
    ]);
    expect(topology.distributedServices.find((service) => service.name === 'retrieval')).toMatchObject({
      runtimeBoundary: 'logical-service-boundary',
      notes: expect.stringContaining('not a dedicated runtime binary'),
    });
  });

  it('maps distributed governance workers to the governance service', () => {
    const deployment = resolveRuntimeDeployment({
      profile: 'distributed',
      preset: 'governance-worker',
      runtimeMode: 'task-worker',
      serviceUnit: 'knowledge-governance',
    });

    const topology = buildServiceTopologySnapshot({
      deployment,
      routeFamilies: [
        {
          kind: 'worker-status',
          audience: 'internal-status',
          description: 'governance worker status routes',
          routes: ['/ready'],
        },
      ],
      runtimeMode: 'task-worker',
      serviceUnit: 'knowledge-governance',
      serviceUnitProfile: getServiceUnitProfile('knowledge-governance', 'task-worker'),
    });

    expect(topology.currentService).toMatchObject({
      name: 'governance',
      surface: 'internal-api',
      runtimeBoundary: 'logical-service-boundary',
      ownershipMode: 'local-worker-owned',
      routeFamilies: ['gateway-api'],
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: true,
      ownsOutboxWork: false,
    });
  });

  it('maps candidate task workers to candidate-ingestion ownership', () => {
    const deployment = resolveRuntimeDeployment({
      profile: 'distributed',
      preset: 'candidate-worker',
      runtimeMode: 'task-worker',
      serviceUnit: 'candidate-ingestion',
    });

    const topology = buildServiceTopologySnapshot({
      deployment,
      routeFamilies: [
        {
          kind: 'worker-status',
          audience: 'internal-status',
          description: 'status only',
          routes: ['/health'],
        },
      ],
      runtimeMode: 'task-worker',
      serviceUnit: 'candidate-ingestion',
      serviceUnitProfile: getServiceUnitProfile('candidate-ingestion', 'task-worker'),
    });

    expect(topology.currentService).toMatchObject({
      name: 'candidate-ingestion',
      surface: 'worker-internal',
      runtimeBoundary: 'dedicated-runtime',
      ownershipMode: 'local-worker-owned',
      ownsCandidateTaskWork: true,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
    });
  });

  it('maps outbox workers to outbox-runtime ownership', () => {
    const deployment = resolveRuntimeDeployment({
      profile: 'distributed',
      preset: 'outbox-worker',
      runtimeMode: 'outbox-worker',
      serviceUnit: 'knowledge-governance',
    });

    const topology = buildServiceTopologySnapshot({
      deployment,
      routeFamilies: [
        {
          kind: 'worker-status',
          audience: 'internal-status',
          description: 'status only',
          routes: ['/ready'],
        },
      ],
      runtimeMode: 'outbox-worker',
      serviceUnit: 'knowledge-governance',
      serviceUnitProfile: getServiceUnitProfile('knowledge-governance', 'outbox-worker'),
    });

    expect(topology.currentService).toMatchObject({
      name: 'outbox-runtime',
      surface: 'worker-internal',
      runtimeBoundary: 'dedicated-runtime',
      ownershipMode: 'local-worker-owned',
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: true,
    });
  });

  it('keeps the topology phase and shared infrastructure contract stable across profiles', () => {
    const deployments = [
      resolveRuntimeDeployment({
        profile: 'local-agent',
        preset: 'monolith',
        runtimeMode: 'api',
        serviceUnit: 'full-platform',
      }),
      resolveRuntimeDeployment({
        profile: 'team-monolith',
        preset: 'monolith',
        runtimeMode: 'combined',
        serviceUnit: 'full-platform',
      }),
      resolveRuntimeDeployment({
        profile: 'distributed',
        preset: 'api',
        runtimeMode: 'api',
        serviceUnit: 'full-platform',
      }),
    ];

    for (const deployment of deployments) {
      const topology = buildServiceTopologySnapshot({
        deployment,
        routeFamilies: [],
        runtimeMode: deployment.runtimeMode,
        serviceUnit: deployment.serviceUnit,
        serviceUnitProfile: getServiceUnitProfile(deployment.serviceUnit, deployment.runtimeMode),
      });

      expect(topology.phase).toBe('shared-postgres-phase1');
      expect(topology.sharedInfrastructure).toEqual([
        'postgresql',
        'shared-contracts',
        'auth-session-model',
        'queue-outbox-semantics',
      ]);
      expect(topology.deferredIsolationBoundaries).toEqual([
        'per-service-database',
        'split-repository-packages',
        'service-mesh-event-backbone',
      ]);
    }
  });
});
