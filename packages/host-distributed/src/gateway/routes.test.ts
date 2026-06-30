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
      getProjectionStatus: vi.fn(async () => ({
        status: 200,
        body: {
          phase: 'phase-2-boundary-closed',
          source: 'mixed-phase-2-read-side-contract',
          consistency: 'eventual',
          freshness: 'current',
          fallback: 'none',
          surfaces: [],
        },
      })),
    },
    knowledgeWrite: {
      submit: vi.fn(async () => ({ status: 201, body: { id: 'entry-1' } })),
      updateEntry: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      resubmit: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      supersede: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      createTrap: vi.fn(async () => ({ status: 201, body: { id: 'trap-1' } })),
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
        body: { candidateId: 'candidate-1' },
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
      getStatus: vi.fn(async () => ({ status: 200, body: { id: 'job-1', status: 'pending' } })),
      getQueueStatus: vi.fn(async () => ({ status: 200, body: { pending: 1 } })),
    },
  };
}

async function buildApp(clients: InternalServiceClients) {
  const app = Fastify();
  registerGatewayRoutes(app, clients);
  await app.ready();
  return app;
}

describe('registerGatewayRoutes', () => {
  it('forwards member updates to identity-access', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'PUT',
      url: '/v1/members/member-1',
      headers: { authorization: 'Bearer session' },
      payload: { updates: { role: 'admin' }, actorId: 'user-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(clients.identityAccess.updateMember).toHaveBeenCalledWith('member-1', {
      updates: { role: 'admin' },
      actorId: 'user-1',
    });
    await app.close();
  });

  it('forwards trap create/list/get routes to knowledge-write', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/traps',
      headers: { authorization: 'Bearer session' },
      payload: { content: 'trap', teamId: 'team-1', actorId: 'user-1', title: 'Trap' },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(clients.knowledgeWrite.createTrap).toHaveBeenCalledWith({
      content: 'trap',
      teamId: 'team-1',
      actorId: 'user-1',
      title: 'Trap',
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/v1/traps?teamId=team-1',
      headers: { authorization: 'Bearer session' },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(clients.knowledgeWrite.listTraps).toHaveBeenCalledWith('team-1');

    const getResponse = await app.inject({
      method: 'GET',
      url: '/v1/traps/trap-1',
      headers: { authorization: 'Bearer session' },
    });
    expect(getResponse.statusCode).toBe(200);
    expect(clients.knowledgeWrite.getTrap).toHaveBeenCalledWith('trap-1');
    await app.close();
  });

  it('forwards projection status requests to knowledge-read', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/knowledge/projection-status',
      headers: { authorization: 'Bearer session' },
    });

    expect(response.statusCode).toBe(200);
    expect(clients.knowledgeRead.getProjectionStatus).toHaveBeenCalled();
    await app.close();
  });

  it('forwards candidate resolution and manual result requests', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const resolutionResponse = await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/resolution',
      headers: { authorization: 'Bearer session' },
      payload: { resolution: { decision: 'merge' }, actorId: 'user-1' },
    });
    expect(resolutionResponse.statusCode).toBe(200);
    expect(clients.candidateIngestion.applyResolution).toHaveBeenCalledWith(
      'candidate-1',
      {
        resolution: { decision: 'merge' },
        actorId: 'user-1',
      },
      {},
    );

    const manualResultResponse = await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/manual-result',
      headers: { authorization: 'Bearer session' },
      payload: { result: { score: 1 }, actorId: 'user-1' },
    });
    expect(manualResultResponse.statusCode).toBe(200);
    expect(clients.candidateIngestion.submitManualResult).toHaveBeenCalledWith(
      'candidate-1',
      {
        result: { score: 1 },
        actorId: 'user-1',
      },
      {},
    );
    await app.close();
  });

  it('forwards request correlation headers to candidate-ingestion write hops', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/manual-result',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-candidate-hop',
        'x-trace-id': 'trace-candidate-hop',
      },
      payload: { result: { score: 1 }, actorId: 'user-1' },
    });

    expect(clients.candidateIngestion.submitManualResult).toHaveBeenCalledWith(
      'candidate-1',
      {
        result: { score: 1 },
        actorId: 'user-1',
      },
      {
        headers: {
          'x-request-id': 'req-candidate-hop',
          'x-trace-id': 'trace-candidate-hop',
        },
      },
    );
    await app.close();
  });

  it('forwards traceparent alongside existing request correlation headers', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/manual-result',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-candidate-hop-2',
        'x-trace-id': 'trace-candidate-hop-2',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      },
      payload: { result: { score: 1 }, actorId: 'user-1' },
    });

    expect(clients.candidateIngestion.submitManualResult).toHaveBeenCalledWith(
      'candidate-1',
      {
        result: { score: 1 },
        actorId: 'user-1',
      },
      {
        headers: {
          'x-request-id': 'req-candidate-hop-2',
          'x-trace-id': 'trace-candidate-hop-2',
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
        },
      },
    );
    await app.close();
  });

  it('forwards artifact review and job runtime routes', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const artifactResponse = await app.inject({
      method: 'POST',
      url: '/v1/artifacts/review',
      headers: { authorization: 'Bearer session' },
      payload: {
        artifactId: 'artifact-1',
        decision: 'approve',
        actorId: 'user-1',
        note: 'ok',
      },
    });
    expect(artifactResponse.statusCode).toBe(200);
    expect(clients.review.reviewArtifact).toHaveBeenCalledWith({
      artifactId: 'artifact-1',
      decision: 'approve',
      actorId: 'user-1',
      note: 'ok',
    });

    const scheduleResponse = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { authorization: 'Bearer session' },
      payload: { type: 'reindex', payload: { entryId: 'entry-1' }, priority: 3 },
    });
    expect(scheduleResponse.statusCode).toBe(201);
    expect(clients.jobRuntime.schedule).toHaveBeenCalledWith({
      type: 'reindex',
      payload: { entryId: 'entry-1' },
      priority: 3,
    });

    const queueResponse = await app.inject({
      method: 'GET',
      url: '/v1/jobs/queue',
      headers: { authorization: 'Bearer session' },
    });
    expect(queueResponse.statusCode).toBe(200);
    expect(clients.jobRuntime.getQueueStatus).toHaveBeenCalled();
    await app.close();
  });

  it('preserves upstream status and body', async () => {
    const clients = createClients();
    clients.identityAccess.provisionAccessKey = vi.fn(async () => ({
      status: 409,
      body: { error: 'duplicate', kind: 'conflict' },
    }));
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { authorization: 'Bearer session' },
      payload: { memberId: 'member-1', actorId: 'user-1' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'duplicate', kind: 'conflict' });
    await app.close();
  });

  it('validates bearer sessions without mutating them', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/teams?userId=user-1',
      headers: { authorization: 'Bearer session' },
    });

    expect(response.statusCode).toBe(200);
    expect(clients.identityAccess.validateSession).toHaveBeenCalledWith({
      sessionToken: 'session',
    });
    expect(clients.identityAccess.logout).not.toHaveBeenCalled();
    await app.close();
  });
});
