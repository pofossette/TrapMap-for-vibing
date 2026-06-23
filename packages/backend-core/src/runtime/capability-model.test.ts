import { describe, expect, it } from 'vitest';

import {
  createStubAuditLog,
  createStubMetrics,
  createStubRepositoryPorts,
} from '../testing/test-utils.js';
import { executeCommand } from '../use-cases/command-handling.js';
import type { Command } from '../use-cases/command-handling.js';
import {
  getServiceUnitProfile,
  resolveAsyncWorkerState,
  resolveDeploymentPreset,
  resolveDeploymentProfileCompatibility,
  resolveRuntimeDeployment,
  resolveServiceUnit,
  shouldBootApiRuntime,
  shouldBootOutboxWorker,
  shouldBootTaskWorker,
  shouldOwnAsyncWork,
} from './capability-model.js';
import {
  buildRouteSurfaceSummary,
  getUnsupportedRouteDescriptors,
  resolveRouteFamilies,
} from './route-surface.js';
import {
  DISTRIBUTED_SERVICES,
  SHARED_INFRASTRUCTURE,
  buildServiceTopologySnapshot,
} from './topology.js';

import { InvocationError } from '../invocation/invocation-model.js';

describe('runtime/capability-model', () => {
  describe('resolveRuntimeDeployment', () => {
    it('resolves local-agent profile', () => {
      const resolved = resolveRuntimeDeployment({
        profile: 'local-agent',
        preset: 'monolith',
      });
      expect(resolved.deploymentProfile).toBe('local-agent');
      expect(resolved.capabilities.routeSurface).toBe('gateway-core');
      expect(resolved.capabilities.supportsLocalSingleUserMode).toBe(true);
      expect(resolved.capabilities.requiresPostgres).toBe(false);
    });

    it('resolves distributed profile with api preset', () => {
      const resolved = resolveRuntimeDeployment({
        profile: 'distributed',
        preset: 'api',
      });
      expect(resolved.deploymentProfile).toBe('distributed');
      expect(resolved.capabilities.routeSurface).toBe('gateway-core');
      expect(resolved.capabilities.supportsDistributedRouting).toBe(true);
      expect(resolved.capabilities.requiresPostgres).toBe(true);
    });

    it('resolves from preset when profile is undefined', () => {
      const resolved = resolveRuntimeDeployment({
        profile: undefined,
        preset: 'candidate-worker',
      });
      expect(resolved.deploymentProfile).toBe('distributed');
      expect(resolved.runtimeMode).toBe('task-worker');
      expect(resolved.serviceUnit).toBe('candidate-ingestion');
    });

    it('defaults to team-monolith combined when no args', () => {
      const resolved = resolveRuntimeDeployment({
        profile: undefined,
        preset: undefined,
      });
      expect(resolved.deploymentProfile).toBe('team-monolith');
      expect(resolved.runtimeMode).toBe('combined');
      expect(resolved.serviceUnit).toBe('full-platform');
    });
  });

  describe('resolveDeploymentProfileCompatibility', () => {
    it('reports distributed requires async ownership', () => {
      const compat = resolveDeploymentProfileCompatibility({
        profile: 'distributed',
        preset: 'api',
      });
      expect(compat.requiresAsyncOwnership).toBe(true);
      expect(compat.allowsSingleProcess).toBe(false);
      expect(compat.requiresPostgres).toBe(true);
    });

    it('reports local-agent allows single process', () => {
      const compat = resolveDeploymentProfileCompatibility({
        profile: 'local-agent',
        preset: 'monolith',
      });
      expect(compat.requiresAsyncOwnership).toBe(false);
      expect(compat.allowsSingleProcess).toBe(true);
      expect(compat.requiresPostgres).toBe(false);
    });
  });

  describe('runtime mode boot logic', () => {
    it('shouldBootApiRuntime', () => {
      expect(shouldBootApiRuntime('api')).toBe(true);
      expect(shouldBootApiRuntime('combined')).toBe(true);
      expect(shouldBootApiRuntime('task-worker')).toBe(false);
    });

    it('shouldBootTaskWorker', () => {
      expect(shouldBootTaskWorker('task-worker')).toBe(true);
      expect(shouldBootTaskWorker('combined')).toBe(true);
      expect(shouldBootTaskWorker('api')).toBe(false);
    });

    it('shouldBootOutboxWorker', () => {
      expect(shouldBootOutboxWorker('outbox-worker')).toBe(true);
      expect(shouldBootOutboxWorker('combined')).toBe(true);
      expect(shouldBootOutboxWorker('api')).toBe(false);
    });

    it('shouldOwnAsyncWork', () => {
      expect(shouldOwnAsyncWork('combined', 'queue')).toBe(true);
      expect(shouldOwnAsyncWork('combined', 'outbox')).toBe(true);
      expect(shouldOwnAsyncWork('api', 'queue')).toBe(false);
    });
  });

  describe('resolveServiceUnit', () => {
    it('parses valid values', () => {
      expect(resolveServiceUnit('candidate-ingestion')).toBe('candidate-ingestion');
      expect(resolveServiceUnit('knowledge-governance')).toBe('knowledge-governance');
      expect(resolveServiceUnit('full-platform')).toBe('full-platform');
    });

    it('defaults to full-platform for unknown values', () => {
      expect(resolveServiceUnit(undefined)).toBe('full-platform');
      expect(resolveServiceUnit(null)).toBe('full-platform');
      expect(resolveServiceUnit('unknown')).toBe('full-platform');
    });
  });

  describe('getServiceUnitProfile', () => {
    it('full-platform owns all work in combined mode', () => {
      const profile = getServiceUnitProfile('full-platform', 'combined');
      expect(profile.ownsCandidateTaskWork).toBe(true);
      expect(profile.ownsSharedJobTaskWork).toBe(true);
      expect(profile.ownsOutboxWork).toBe(true);
    });

    it('candidate-ingestion only owns candidate work', () => {
      const profile = getServiceUnitProfile('candidate-ingestion', 'combined');
      expect(profile.ownsCandidateTaskWork).toBe(true);
      expect(profile.ownsSharedJobTaskWork).toBe(false);
      expect(profile.ownsOutboxWork).toBe(false);
    });
  });

  describe('resolveAsyncWorkerState', () => {
    it('returns not-configured for json-store', () => {
      const state = resolveAsyncWorkerState({
        database: 'json-store',
        runtimeMode: 'combined',
        workerKind: 'queue',
      });
      expect(state).toBe('not-configured');
    });

    it('returns running when worker is active and owned', () => {
      const state = resolveAsyncWorkerState({
        database: 'postgres',
        runtimeMode: 'combined',
        workerKind: 'queue',
        owner: true,
        running: true,
      });
      expect(state).toBe('running');
    });

    it('returns degraded when worker is owned but not running', () => {
      const state = resolveAsyncWorkerState({
        database: 'postgres',
        runtimeMode: 'combined',
        workerKind: 'queue',
        owner: true,
        running: false,
      });
      expect(state).toBe('degraded');
    });

    it('returns remote when mode does not own work', () => {
      const state = resolveAsyncWorkerState({
        database: 'postgres',
        runtimeMode: 'api',
        workerKind: 'queue',
        owner: false,
        running: false,
      });
      expect(state).toBe('remote');
    });
  });
});

describe('runtime/route-surface', () => {
  it('resolveRouteFamilies returns worker-status for worker-status surface', () => {
    const families = resolveRouteFamilies('worker-status', false);
    expect(families).toHaveLength(1);
    expect(families[0]!.kind).toBe('worker-status');
  });

  it('resolveRouteFamilies returns gateway-api for gateway-core surface', () => {
    const families = resolveRouteFamilies('gateway-core', false);
    expect(families).toHaveLength(1);
    expect(families[0]!.kind).toBe('gateway-api');
  });

  it('getUnsupportedRouteDescriptors returns empty for gateway-core', () => {
    const descriptors = getUnsupportedRouteDescriptors('gateway-core');
    expect(descriptors).toHaveLength(0);
  });

  it('buildRouteSurfaceSummary computes correct counts', () => {
    const resolved = resolveRuntimeDeployment({
      profile: 'team-monolith',
      preset: 'monolith',
    });
    const summary = buildRouteSurfaceSummary(resolved);
    expect(summary.publicGatewayRouteCount).toBeGreaterThan(0);
    expect(summary.routeSurface).toBe('gateway-core');
  });
});

describe('runtime/topology', () => {
  it('buildServiceTopologySnapshot creates a valid snapshot', () => {
    const resolved = resolveRuntimeDeployment({
      profile: 'team-monolith',
      preset: 'monolith',
    });
    const families = resolveRouteFamilies('gateway-core', true);
    const snapshot = buildServiceTopologySnapshot({
      deployment: resolved,
      routeFamilies: families,
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
    });
    expect(snapshot.deploymentProfile).toBe('team-monolith');
    expect(snapshot.phase).toBe('shared-postgres-phase1');
    expect(snapshot.currentService.name).toBe('gateway');
    expect(snapshot.sharedInfrastructure).toEqual(SHARED_INFRASTRUCTURE);
    expect(snapshot.distributedServices).toEqual(DISTRIBUTED_SERVICES);
  });
});

describe('invocation/invocation-model', () => {
  it('InvocationError creates typed errors', () => {
    const err = InvocationError.notFound('test');
    expect(err.kind).toBe('not-found');
    expect(err.message).toBe('test');
    expect(err.name).toBe('InvocationError');
  });

  it('InvocationError factory methods work', () => {
    expect(InvocationError.validation('v').kind).toBe('validation');
    expect(InvocationError.conflict('c').kind).toBe('conflict');
    expect(InvocationError.forbidden('f').kind).toBe('forbidden');
    expect(InvocationError.timeout('t').kind).toBe('timeout');
    expect(InvocationError.unavailable('u').kind).toBe('unavailable');
    expect(InvocationError.internal('i').kind).toBe('internal');
  });
});

describe('use-cases/command-handling', () => {
  it('executeCommand wraps success', async () => {
    const cmd: Command<string, number> = { execute: async (input) => input.length };
    const result = await executeCommand(cmd, 'hello');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  it('executeCommand wraps InvocationError', async () => {
    const cmd: Command<string, number> = {
      execute: async () => {
        throw InvocationError.notFound('nope');
      },
    };
    const result = await executeCommand(cmd, 'hello');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-found');
    }
  });

  it('executeCommand wraps unknown errors as internal', async () => {
    const cmd: Command<string, number> = {
      execute: async () => {
        throw new Error('boom');
      },
    };
    const result = await executeCommand(cmd, 'hello');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('internal');
    }
  });
});

describe('testing/test-utils', () => {
  it('createStubAuditLog records and queries', async () => {
    const audit = createStubAuditLog();
    await audit.record({ action: 'test', actorId: 'u1' });
    const result = await audit.query({});
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('createStubMetrics tracks counters', () => {
    const metrics = createStubMetrics();
    metrics.incrementCounter('requests');
    metrics.incrementCounter('requests');
    metrics.recordDuration('latency', 42);
    metrics.recordGauge('connections', 3);
  });

  it('createStubRepositoryPorts returns all repos', () => {
    const repos = createStubRepositoryPorts();
    expect(repos.knowledge).toBeDefined();
    expect(repos.candidate).toBeDefined();
    expect(repos.session).toBeDefined();
    expect(repos.accessKey).toBeDefined();
    expect(repos.team).toBeDefined();
    expect(repos.membership).toBeDefined();
    expect(repos.user).toBeDefined();
    expect(repos.feedback).toBeDefined();
    expect(repos.audit).toBeDefined();
  });
});
