/**
 * Phase 3 golden evidence: distributed service-node wiring.
 *
 * Verifies the per-service server nodes expose the `serviceServer` provide
 * and inject the shared config/database services, and that the job-runtime
 * node carries the D7 worker children declaration.
 */
import { describe, expect, it } from 'vitest';

import { startupChecks } from '@trapmap/assembly';

import {
  SERVICE_SERVER_SERVICE,
  candidateIngestionServiceNode,
  candidateProcessingWorkerNode,
  conflictDetectionWorkerNode,
  cronServiceNode,
  gatewayServiceNode,
  governanceFeedbackWorkerNode,
  governanceReviewServiceNode,
  identityAccessServiceNode,
  jobRuntimeServiceNode,
  knowledgeReadServiceNode,
  knowledgeWriteServiceNode,
  outboxDispatchWorkerNode,
} from '../../../src/assembly/nodes/distributed-service-nodes.js';
import { SERVICE_CONFIG_SERVICE } from '../../../src/assembly/nodes/service-config.js';
import { SERVICE_DATABASE_SERVICE } from '../../../src/assembly/nodes/service-database.js';

function injectsOf(node: { inject?: readonly string[] | undefined }): readonly string[] {
  return node.inject ?? [];
}

describe('distributed service nodes', () => {
  it('gateway node injects only serviceConfig (no own DB)', () => {
    expect(providesOf(gatewayServiceNode)).toContain(SERVICE_SERVER_SERVICE);
    expect(injectsOf(gatewayServiceNode)).toEqual([SERVICE_CONFIG_SERVICE]);
  });

  it.each([
    ['identityAccess', identityAccessServiceNode],
    ['knowledgeRead', knowledgeReadServiceNode],
    ['knowledgeWrite', knowledgeWriteServiceNode],
    ['candidateIngestion', candidateIngestionServiceNode],
    ['governanceReview', governanceReviewServiceNode],
    ['jobRuntime', jobRuntimeServiceNode],
    ['cron', cronServiceNode],
  ] as const)('%s node injects config + database and provides the server', (_name, node) => {
    expect(providesOf(node)).toContain(SERVICE_SERVER_SERVICE);
    expect(injectsOf(node)).toContain(SERVICE_CONFIG_SERVICE);
    expect(injectsOf(node)).toContain(SERVICE_DATABASE_SERVICE);
  });
});

describe('job-runtime worker children (D7)', () => {
  const children = jobRuntimeServiceNode.children ?? [];

  it('declares the four worker sub-node ids', () => {
    expect(children).toEqual([
      'candidate-processing',
      'governance-feedback',
      'conflict-detection',
      'outbox-dispatch',
    ]);
  });

  it('worker sub-nodes are declared embedded and pass startupChecks on their own', () => {
    const declared = [
      candidateProcessingWorkerNode,
      governanceFeedbackWorkerNode,
      conflictDetectionWorkerNode,
      outboxDispatchWorkerNode,
    ];
    // worker children themselves are self-contained (no injects)
    expect(startupChecks(declared)).toEqual([]);
    // the children ids exist and are referenced by the job-runtime node
    const childIds = new Set(declared.map((n) => n.id));
    expect(new Set(jobRuntimeServiceNode.children ?? []).size).toBe(childIds.size);
    for (const workerId of jobRuntimeServiceNode.children ?? []) {
      expect(childIds).toContain(workerId);
    }
  });
});

function providesOf(node: { provides?: string | readonly string[] | undefined }): string[] {
  if (node.provides === undefined) return [];
  return Array.isArray(node.provides) ? node.provides : [node.provides];
}
