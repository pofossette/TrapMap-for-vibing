import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { InternalServiceClients } from './internal-client.js';
import { registerGatewayRoutes } from './routes.js';

function createClients(): InternalServiceClients {
  return {
    identityAccess: {
      login: vi.fn(async () => ({ status: 200, body: { token: 'session' } })),
      logout: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      validateSession: vi.fn(async () => ({
        status: 200,
        body: {
          sessionId: 'session-1',
          userId: 'user-1',
          handle: 'alice',
          activeTeamId: null,
          securityLevel: 1,
        },
      })),
      selectTeam: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      createTeam: vi.fn(async () => ({ status: 201, body: { teamId: 'team-1' } })),
      listTeams: vi.fn(async () => ({ status: 200, body: [{ id: 'team-1' }] })),
      addMember: vi.fn(async () => ({ status: 201, body: { ok: true } })),
      updateMember: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      provisionAccessKey: vi.fn(async () => ({ status: 201, body: { keyId: 'key-1' } })),
    },
    knowledgeRead: {
      getById: vi.fn(async () => ({ status: 200, body: { id: 'entry-1' } })),
      listMine: vi.fn(async () => ({ status: 200, body: [] })),
      search: vi.fn(async () => ({ status: 200, body: { results: [] } })),
    },
    knowledgeWrite: {
      submit: vi.fn(async () => ({ status: 201, body: { id: 'entry-1' } })),
      updateEntry: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      resubmit: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      supersede: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      createTrap: vi.fn(async () => ({ status: 201, body: { id: 'trap-1' } })),
      approveReviewDecision: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', lifecycleState: 'approved' },
      })),
      rejectReviewDecision: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', lifecycleState: 'rejected' },
      })),
      applyMaintenanceDecision: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', action: 'refresh' },
      })),
      applyDecayDecision: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', action: 'suppress' },
      })),
      publishCandidateResult: vi.fn(async () => ({
        status: 200,
        body: { candidateId: 'candidate-1', entryId: 'entry-1' },
      })),
      listTraps: vi.fn(async () => ({ status: 200, body: [{ id: 'trap-1' }] })),
      getTrap: vi.fn(async () => ({ status: 200, body: { id: 'trap-1' } })),
    },
    candidateIngestion: {
      submit: vi.fn(async () => ({ status: 201, body: { id: 'candidate-1' } })),
      getById: vi.fn(async () => ({ status: 200, body: { id: 'candidate-1' } })),
      listByStatus: vi.fn(async () => ({ status: 200, body: [{ id: 'candidate-1' }] })),
      applyResolution: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      submitManualResult: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      publishCandidateResult: vi.fn(async () => ({
        status: 200,
        body: { candidateId: 'candidate-1', entryId: 'entry-1' },
      })),
    },
    review: {
      approve: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reject: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      applyMaintenance: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      applyDecay: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reviewArtifact: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      submitFeedback: vi.fn(async () => ({ status: 201, body: { id: 'feedback-1' } })),
    },
    governanceReview: {
      approve: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reject: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      applyMaintenance: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      applyDecay: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reviewArtifact: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      submitFeedback: vi.fn(async () => ({ status: 201, body: { id: 'feedback-1' } })),
    },
    jobRuntime: {
      schedule: vi.fn(async () => ({ status: 201, body: { jobId: 'job-1' } })),
      getStatus: vi.fn(async () => ({ status: 200, body: { id: 'job-1', status: 'running' } })),
      getQueueStatus: vi.fn(async () => ({
        status: 200,
        body: { pending: 1, running: 1, degraded: false },
      })),
    },
  };
}

async function buildApp(clients: InternalServiceClients) {
  const app = Fastify();
  registerGatewayRoutes(app, clients);
  await app.ready();
  return app;
}

describe('distributed gateway acceptance', () => {
  it('routes candidate resolution and manual result exclusively to candidate-ingestion', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/resolution',
      headers: { authorization: 'Bearer session' },
      payload: { resolution: { decision: 'merge' }, actorId: 'user-1' },
    });

    await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/manual-result',
      headers: { authorization: 'Bearer session' },
      payload: { result: { score: 1 }, actorId: 'user-1' },
    });

    expect(clients.candidateIngestion.applyResolution).toHaveBeenCalledTimes(1);
    expect(clients.candidateIngestion.submitManualResult).toHaveBeenCalledTimes(1);
    expect(clients.knowledgeWrite.publishCandidateResult).not.toHaveBeenCalled();
    expect(clients.review.approve).not.toHaveBeenCalled();
    await app.close();
  });

  it('routes review, maintenance, and decay write commands to governance-review without server fallback', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const approve = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: { authorization: 'Bearer session' },
      payload: { entryId: 'entry-1', actorId: 'user-1', decision: 'approve', note: 'ship it' },
    });
    const maintenance = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/maintenance',
      headers: { authorization: 'Bearer session' },
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'refresh' },
    });
    const decay = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/decay',
      headers: { authorization: 'Bearer session' },
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'suppress' },
    });

    expect(approve.statusCode).toBe(200);
    expect(maintenance.statusCode).toBe(200);
    expect(decay.statusCode).toBe(200);
    expect(clients.review.approve).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'ship it',
    });
    expect(clients.review.applyMaintenance).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'refresh',
    });
    expect(clients.review.applyDecay).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'suppress',
    });
    expect(clients.knowledgeWrite.approveReviewDecision).not.toHaveBeenCalled();
    expect(clients.governanceReview.reject).not.toHaveBeenCalled();
    expect(clients.governanceReview.reviewArtifact).not.toHaveBeenCalled();
    await app.close();
  });

  it('exposes distributed job-runtime ownership through gateway scheduling and status paths', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const schedule = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { authorization: 'Bearer session' },
      payload: { type: 'knowledge.index-follow-up', payload: { entryId: 'entry-1' }, priority: 5 },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/v1/jobs/job-1',
      headers: { authorization: 'Bearer session' },
    });
    const queue = await app.inject({
      method: 'GET',
      url: '/v1/jobs/queue',
      headers: { authorization: 'Bearer session' },
    });

    expect(schedule.statusCode).toBe(201);
    expect(status.statusCode).toBe(200);
    expect(queue.statusCode).toBe(200);
    expect(clients.jobRuntime.schedule).toHaveBeenCalledWith({
      type: 'knowledge.index-follow-up',
      payload: { entryId: 'entry-1' },
      priority: 5,
    });
    expect(clients.jobRuntime.getStatus).toHaveBeenCalledWith('job-1');
    expect(clients.jobRuntime.getQueueStatus).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
