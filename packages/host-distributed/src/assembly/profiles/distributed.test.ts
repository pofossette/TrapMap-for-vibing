/**
 * Phase 3 golden evidence: distributed profile switch (design D3).
 *
 * Each distributed service name must build an assembly whose node set passes
 * startupChecks and exposes the expected config/database/server topology.
 * The worker variants surface the job-runtime worker sub-node declarations.
 */
import { describe, expect, it } from 'vitest';

import { ALL_SERVICES, type ServiceName } from '../../config/index.js';
import { SERVICE_CONFIG_SERVICE } from '../nodes/service-config.js';
import { SERVICE_DATABASE_SERVICE } from '../nodes/service-database.js';
import { SERVICE_SERVER_SERVICE } from '../nodes/distributed-service-nodes.js';
import { buildDistributedAssembly, distributedAssembly } from './distributed.js';

const SERVICE_NODE_ID: Record<ServiceName, string> = {
  gateway: 'gateway-service',
  'identity-access': 'identity-access-service',
  'knowledge-read': 'knowledge-read-service',
  'knowledge-write': 'knowledge-write-service',
  'candidate-ingestion': 'candidate-ingestion-service',
  'governance-review': 'governance-review-service',
  'job-runtime': 'job-runtime-service',
  'cron-scheduler': 'cron-service',
};

const JOB_RUNTIME_WORKER_IDS: readonly string[] = [
  'candidate-processing',
  'governance-feedback',
  'conflict-detection',
  'outbox-dispatch',
];

function providesOf(node: { provides?: string | readonly string[] | undefined }): string[] {
  if (node.provides === undefined) return [];
  return Array.isArray(node.provides) ? node.provides : [node.provides];
}

describe('distributedAssembly profile switch', () => {
  it.each(ALL_SERVICES)('%s.build() passes startupChecks', (serviceName) => {
    const assembly = distributedAssembly(serviceName).build();
    expect(assembly.nodes.map((n) => n.id)).toContain(SERVICE_NODE_ID[serviceName]);
  });

  it.each([
    ['gateway', false],
    ['identity-access', true],
    ['knowledge-read', true],
    ['knowledge-write', true],
    ['candidate-ingestion', true],
    ['governance-review', true],
    ['job-runtime', true],
    ['cron-scheduler', true],
  ] as const)('%s composes %s database node', (serviceName, expectsDb) => {
    const assembly = buildDistributedAssembly(serviceName);
    const hasConfig = assembly.nodes.some((n) => providesOf(n).includes(SERVICE_CONFIG_SERVICE));
    const hasDb = assembly.nodes.some((n) => providesOf(n).includes(SERVICE_DATABASE_SERVICE));
    const hasServer = assembly.nodes.some((n) => providesOf(n).includes(SERVICE_SERVER_SERVICE));
    expect(hasConfig).toBe(true);
    expect(hasDb).toBe(expectsDb);
    expect(hasServer).toBe(true);
  });

  it('job-runtime declares its D7 worker sub-nodes as children', () => {
    const assembly = buildDistributedAssembly('job-runtime');
    const jobRuntimeNode = assembly.nodes.find((n) => n.id === 'job-runtime-service');
    expect(jobRuntimeNode?.children).toEqual(JOB_RUNTIME_WORKER_IDS);
    const childIds = new Set(assembly.nodes.map((n) => n.id));
    for (const workerId of JOB_RUNTIME_WORKER_IDS) {
      expect(childIds).toContain(workerId);
    }
    expect(childIds.size).toBe(assembly.nodes.length);
  });

  it('gateway has no service-database node (no own DB)', () => {
    const assembly = buildDistributedAssembly('gateway');
    expect(assembly.nodes.filter((n) => n.id === 'service-database')).toHaveLength(0);
  });

  it('build exposes a frozen read-only node list', () => {
    const assembly = buildDistributedAssembly('knowledge-read');
    expect(Object.isFrozen(assembly.nodes)).toBe(true);
  });
});
