import * as contracts from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { HostLocalRuntime } from '../runtime/host-runtime.js';
import { createGatewayRouteDefs } from './gateway.route-defs.js';

function createDeps() {
  return {
    knowledgeRead: {
      getById: vi.fn(),
      listMine: vi.fn(),
      search: vi.fn(),
      getProjectionStatus: vi.fn(),
    },
    candidateIngestion: {
      submit: vi.fn(),
      getById: vi.fn(),
      listByStatus: vi.fn(),
      applyResolution: vi.fn(),
      submitManualResult: vi.fn(),
      publishCandidateResult: vi.fn(),
    },
    governanceReview: {
      approve: vi.fn(),
      reject: vi.fn(),
      applyMaintenance: vi.fn(),
      applyDecay: vi.fn(),
      reviewArtifact: vi.fn(),
      submitFeedback: vi.fn(),
    },
    cron: {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      delete: vi.fn(),
      trigger: vi.fn(),
      statusSnapshots: vi.fn(),
      scheduler: {
        run: vi.fn(),
        stop: vi.fn(),
        isRunning: vi.fn(),
        ownsWork: vi.fn(),
      },
    },
    runtime: {} as HostLocalRuntime,
  };
}

describe('gateway route defs', () => {
  it('exposes the documented /v1 knowledge, candidate and cron surface', () => {
    const defs = createGatewayRouteDefs(createDeps());

    expect(defs.map((def) => `${def.method} ${def.path}`)).toEqual([
      'GET /v1/knowledge/:entryId',
      'GET /v1/knowledge/mine',
      'POST /v1/retrieval/search',
      'GET /v1/knowledge/projection-status',
      'POST /v1/candidates/:candidateId/manual-result',
      'POST /v1/candidates/:candidateId/apply-resolution',
      'GET /v1/knowledge/review-queue',
      'POST /v1/knowledge/review',
      'GET /v1/cron/jobs',
      'POST /v1/cron/jobs',
      'GET /v1/cron/jobs/:jobId',
      'PATCH /v1/cron/jobs/:jobId',
      'DELETE /v1/cron/jobs/:jobId',
      'POST /v1/cron/jobs/:jobId/trigger',
      'GET /v1/cron/status',
    ]);
  });

  it('reuses the shared contracts schemas for search and review bodies', () => {
    const defs = createGatewayRouteDefs(createDeps());
    const contractRecord = contracts as Record<string, unknown>;

    const search = defs.find((def) => def.path === '/v1/retrieval/search');
    const review = defs.find((def) => def.path === '/v1/knowledge/review');
    const manualResult = defs.find(
      (def) => def.path === '/v1/candidates/:candidateId/manual-result',
    );
    const reviewQueue = defs.find((def) => def.path === '/v1/knowledge/review-queue');

    expect(contractRecord).toHaveProperty('retrievalSearchBodySchema');
    expect(search?.schema).toBeDefined();
    expect(review?.schema).toBeDefined();
    expect(manualResult?.schema).toBeDefined();
    expect(reviewQueue?.schema).toBeDefined();
  });
});
