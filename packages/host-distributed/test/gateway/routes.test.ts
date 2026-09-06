import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { InternalServiceClients } from '../../src/gateway/internal-client.js';
import { registerGatewayRoutes } from '../../src/gateway/routes.js';

type FeedbackAdminRequestOptions = { headers?: Record<string, string> };
type FeedbackAdminTestClient = {
  list(query: Record<string, string>, options?: FeedbackAdminRequestOptions): Promise<unknown>;
  batch(body: Record<string, unknown>, options?: FeedbackAdminRequestOptions): Promise<unknown>;
  stats(entryId: string, options?: FeedbackAdminRequestOptions): Promise<unknown>;
  listRemediation(options?: FeedbackAdminRequestOptions): Promise<unknown>;
  getRemediation(entryId: string, options?: FeedbackAdminRequestOptions): Promise<unknown>;
  completeRemediation(
    entryId: string,
    body: Record<string, unknown>,
    options?: FeedbackAdminRequestOptions,
  ): Promise<unknown>;
};

const TEST_SESSION = {
  sessionId: 'session-1',
  member: {
    id: 'member-1',
    teamId: 'team-1',
    handle: 'alice',
    roleTemplate: 'admin',
    securityLevel: 5,
    permissions: [],
    notes: null,
    isSystem: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  activeTeam: {
    id: 'team-1',
    slug: 'alpha',
    name: 'Alpha',
    description: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  effectivePermissions: ['session:read'],
  expiresAt: null,
  issuedAt: '2024-01-01T00:00:00Z',
};

function createClients(): InternalServiceClients & { feedbackAdmin: FeedbackAdminTestClient } {
  return {
    identityAccess: {
      login: vi.fn(async () => ({
        status: 200,
        body: { session: TEST_SESSION, sessionToken: 'session' },
      })),
      loginSystemAdmin: vi.fn(async () => ({
        status: 200,
        body: { session: TEST_SESSION, sessionToken: 'system-session' },
      })),
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
      search: vi.fn(async () => ({
        status: 200,
        body: {
          globalConstraints: [],
          projectKnowledge: [],
          refinementSummary: null,
          summary: null,
        },
      })),
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
      importArtifact: vi.fn(async () => ({ status: 201, body: { id: 'artifact-1' } })),
      editArtifact: vi.fn(async () => ({ status: 200, body: { id: 'artifact-1' } })),
      artifactHistory: vi.fn(async () => ({ status: 200, body: [] })),
      exportArtifacts: vi.fn(async () => ({ status: 200, body: [] })),
      artifactReviewQueue: vi.fn(async () => ({ status: 200, body: [] })),
      reviewArtifact: vi.fn(async () => ({ status: 200, body: { id: 'artifact-1' } })),
      activateArtifact: vi.fn(async () => ({ status: 200, body: { id: 'artifact-1' } })),
      deactivateArtifact: vi.fn(async () => ({ status: 200, body: { id: 'artifact-1' } })),
      submit: vi.fn(async () => ({ status: 201, body: { id: 'entry-1' } })),
      updateEntry: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      resubmit: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      supersede: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      createTrap: vi.fn(async () => ({ status: 201, body: { id: 'trap-1' } })),
      applyMaintenanceDecision: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      listTraps: vi.fn(async () => ({ status: 200, body: [{ id: 'trap-1' }] })),
      getTrap: vi.fn(async () => ({ status: 200, body: { id: 'trap-1' } })),
      returnReviewDecision: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', lifecycleState: 'submitted' },
      })),
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
      returnForCorrection: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', lifecycleState: 'submitted' },
      })),
      applyMaintenance: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      applyDecay: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reviewArtifact: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      submitFeedback: vi.fn(async () => ({ status: 201, body: { id: 'feedback-1' } })),
    },
    governanceReview: {
      approve: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reject: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      returnForCorrection: vi.fn(async () => ({
        status: 200,
        body: { entryId: 'entry-1', lifecycleState: 'submitted' },
      })),
      applyMaintenance: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      applyDecay: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      reviewArtifact: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      submitFeedback: vi.fn(async () => ({ status: 201, body: { id: 'feedback-1' } })),
    },
    feedbackAdmin: {
      list: vi.fn(async () => ({ status: 200, body: { items: [], total: 0 } })),
      batch: vi.fn(async () => ({ status: 200, body: { action: 'triage' } })),
      stats: vi.fn(async () => ({ status: 200, body: { entryId: 'entry-1' } })),
      listRemediation: vi.fn(async () => ({ status: 200, body: { items: [], total: 0 } })),
      getRemediation: vi.fn(async () => ({ status: 200, body: { item: { entryId: 'entry-1' } } })),
      completeRemediation: vi.fn(async () => ({ status: 200, body: { entryId: 'entry-1' } })),
    },
    jobRuntime: {
      schedule: vi.fn(async () => ({ status: 201, body: { jobId: 'job-1' } })),
      getStatus: vi.fn(async () => ({ status: 200, body: { id: 'job-1', status: 'pending' } })),
      getQueueStatus: vi.fn(async () => ({ status: 200, body: { pending: 1 } })),
    },
    cronScheduler: {
      listJobs: vi.fn(async () => ({ status: 200, body: [] })),
      createJob: vi.fn(async () => ({ status: 201, body: { id: 'cron-1' } })),
      getJob: vi.fn(async () => ({ status: 200, body: { id: 'cron-1' } })),
      updateJob: vi.fn(async () => ({ status: 200, body: { id: 'cron-1' } })),
      deleteJob: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      triggerJob: vi.fn(async () => ({ status: 200, body: { id: 'cron-1' } })),
      getStatus: vi.fn(async () => ({ status: 200, body: { jobs: [] } })),
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
  it('forwards every feedback admin URL through the governance owner', async () => {
    const clients = createClients();
    const app = await buildApp(clients);
    const headers = {
      authorization: 'Bearer session-token',
      'x-request-id': 'feedback-admin-request',
      'x-trace-id': 'feedback-admin-trace',
      'x-correlation-id': 'feedback-admin-correlation',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };
    const internalOptions = {
      headers: {
        'x-request-id': 'feedback-admin-request',
        'x-trace-id': 'feedback-admin-trace',
        'x-correlation-id': 'feedback-admin-correlation',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'x-trapmap-actor-id': 'user-1',
      },
    };

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/v1/operations/feedback?status=new&limit=10',
        headers,
      }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/batch',
        headers,
        payload: {
          feedbackIds: ['feedback-1'],
          action: 'triage',
          dryRun: true,
          actorId: 'user-1',
        },
      }),
      app.inject({
        method: 'GET',
        url: '/v1/operations/feedback/stats/entry-1',
        headers,
      }),
      app.inject({
        method: 'GET',
        url: '/v1/operations/feedback/remediation',
        headers,
      }),
      app.inject({
        method: 'GET',
        url: '/v1/operations/feedback/remediation/entry-1',
        headers,
      }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/feedback/remediation/entry-1/complete',
        headers,
        payload: { notes: 'reindexed', actorId: 'user-1' },
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    expect(clients.feedbackAdmin.list).toHaveBeenCalledWith(
      { status: 'new', limit: '10' },
      internalOptions,
    );
    expect(clients.feedbackAdmin.batch).toHaveBeenCalledWith(
      { feedbackIds: ['feedback-1'], action: 'triage', dryRun: true },
      internalOptions,
    );
    expect(clients.feedbackAdmin.stats).toHaveBeenCalledWith('entry-1', internalOptions);
    expect(clients.feedbackAdmin.listRemediation).toHaveBeenCalledWith(internalOptions);
    expect(clients.feedbackAdmin.getRemediation).toHaveBeenCalledWith('entry-1', internalOptions);
    expect(clients.feedbackAdmin.completeRemediation).toHaveBeenCalledWith(
      'entry-1',
      { notes: 'reindexed' },
      internalOptions,
    );
    await app.close();
  });

  it('preserves governance admin status and canonical error bodies', async () => {
    const clients = createClients();
    clients.feedbackAdmin.list = vi.fn(async () => ({
      status: 409,
      body: { error: 'admin conflict', kind: 'conflict' },
    }));
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/feedback',
      headers: { authorization: 'Bearer session-token' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'admin conflict', kind: 'conflict' });
    await app.close();
  });

  it('rejects an admin body actor that spoofs the authenticated actor', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/feedback/remediation/entry-1/complete',
      headers: { authorization: 'Bearer session-token' },
      payload: { notes: 'reindexed', actorId: 'spoofed-user' },
    });

    expect(response.statusCode).toBe(403);
    expect(clients.feedbackAdmin.completeRemediation).not.toHaveBeenCalled();
    await app.close();
  });

  it('forwards feedback using the authenticated actor instead of a spoofed body actor', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: { authorization: 'Bearer session-token' },
      payload: {
        entryId: 'entry-1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'This result contains an incorrect remediation.',
        actorId: 'spoofed-user',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(clients.review.submitFeedback).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an artifact mutation when the body actor spoofs the authenticated actor', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/artifacts/activate',
      headers: { authorization: 'Bearer session-token', 'x-request-id': 'request-1' },
      payload: { artifactId: 'artifact-1', selectedPaths: [], actorId: 'spoofed-user' },
    });

    expect(response.statusCode).toBe(403);
    expect(clients.knowledgeWrite.activateArtifact).not.toHaveBeenCalled();
    await app.close();
  });

  it('forwards return-for-correction through the governance service', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: { authorization: 'Bearer session-token' },
      payload: {
        entryId: 'entry-1',
        actorId: 'user-1',
        decision: 'return-for-correction',
        note: 'revise the boundary fields',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(clients.review.reject).not.toHaveBeenCalled();
    expect(clients.review.returnForCorrection).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'revise the boundary fields',
    });
    await app.close();
  });

  it.each([
    {
      description: 'with a body actor',
      payload: { content: 'content', actorId: 'user-1' },
      expectedStatus: 401,
    },
    // A6 拍板（恢复严格契约）：body.actorId 必填，schema 校验（400）先于 handler 的 trusted-actor 检查
    {
      description: 'before body validation (A6 strict schema)',
      payload: { content: 'content' },
      expectedStatus: 400,
    },
  ])(
    'rejects a mutation when the authenticated identity has no actor $description',
    async ({ payload, expectedStatus }) => {
      const clients = createClients();
      clients.identityAccess.validateSession = vi.fn(async () => ({
        status: 200,
        body: { sessionId: 'session-1' },
      }));
      const app = await buildApp(clients);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: { authorization: 'Bearer session-token' },
        payload,
      });

      expect(response.statusCode).toBe(expectedStatus);
      expect(clients.knowledgeWrite.submit).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it('rejects a mutation when the body actor spoofs the authenticated actor', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/knowledge',
      headers: { authorization: 'Bearer session-token' },
      payload: { content: 'content', actorId: 'spoofed-user' },
    });

    expect(response.statusCode).toBe(403);
    expect(clients.knowledgeWrite.submit).not.toHaveBeenCalled();
    await app.close();
  });

  it('forwards maintenance commands to the knowledge-write owner', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/knowledge/maintenance',
      headers: { authorization: 'Bearer session-token' },
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'refresh' },
    });

    expect(response.statusCode).toBe(200);
    expect(clients.knowledgeWrite.applyMaintenanceDecision).toHaveBeenCalledWith(
      {
        entryId: 'entry-1',
        actorId: 'user-1',
        action: 'refresh',
      },
      { headers: { 'x-trapmap-actor-id': 'user-1' } },
    );
    expect(clients.review.applyMaintenance).not.toHaveBeenCalled();
    await app.close();
  });

  it('forwards a system admin login and emits the issued session header', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { systemAdminKey: 'correct-key' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-session-token']).toBe('system-session');
    // External contract body is strictly `{ session }`: internal token must not leak.
    expect(response.json()).toEqual({ session: TEST_SESSION });
    expect(clients.identityAccess.loginSystemAdmin).toHaveBeenCalledWith({
      systemAdminKey: 'correct-key',
    });
    expect(clients.identityAccess.login).not.toHaveBeenCalled();
    await app.close();
  });

  it('passes login error envelopes through verbatim without a session header', async () => {
    const clients = createClients();
    vi.mocked(clients.identityAccess.loginSystemAdmin).mockResolvedValueOnce({
      status: 401,
      body: { error: 'Invalid system administrator key', kind: 'auth' },
    });
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { systemAdminKey: 'wrong-key' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['x-session-token']).toBeUndefined();
    expect(response.json()).toEqual({ error: 'Invalid system administrator key', kind: 'auth' });
    await app.close();
  });

  it('preserves ordinary handle and password login forwarding', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-session-token']).toBe('session');
    expect(response.json()).toEqual({ session: TEST_SESSION });
    expect(clients.identityAccess.login).toHaveBeenCalledWith({
      handle: 'alice',
      password: 'secret',
    });
    await app.close();
  });

  it('exposes the job-runtime operator status through the compatibility route', async () => {
    const clients = createClients();
    const app = await buildApp(clients);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/status/async',
      headers: { authorization: 'Bearer session' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      asyncRuntimeEnabled: true,
      deploymentProfile: 'distributed',
      queue: { pending: 1, reclaimCount: 0 },
    });
    await app.close();
  });

  it('allows anonymous metrics access for runtime observability', async () => {
    const clients = createClients();
    const app = Fastify();
    registerGatewayRoutes(app, clients);
    app.get('/metrics', async () => 'trapmap_runtime_http_requests_total 1\n');
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('trapmap_runtime_http_requests_total');
    expect(clients.identityAccess.validateSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('allows anonymous liveness access', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'GET',
      url: '/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: 'alive',
        timestamp: expect.any(String),
      }),
    );
    expect(clients.identityAccess.validateSession).not.toHaveBeenCalled();
    await app.close();
  });

  it('allows anonymous readiness access', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        service: 'gateway',
        status: 'ready',
        timestamp: expect.any(String),
      }),
    );
    expect(clients.identityAccess.validateSession).not.toHaveBeenCalled();
    await app.close();
  });

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
    expect(clients.knowledgeWrite.createTrap).toHaveBeenCalledWith(
      {
        content: 'trap',
        teamId: 'team-1',
        actorId: 'user-1',
        title: 'Trap',
      },
      { headers: { 'x-trapmap-actor-id': 'user-1' } },
    );

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

  it('rejects candidate mutations and job scheduling when required fields are missing', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const missingResolution = await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/resolution',
      headers: { authorization: 'Bearer session' },
      payload: { actorId: 'user-1' },
    });
    expect(missingResolution.statusCode).toBe(400);
    expect(clients.candidateIngestion.applyResolution).not.toHaveBeenCalled();

    const missingResult = await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/manual-result',
      headers: { authorization: 'Bearer session' },
      payload: { actorId: 'user-1' },
    });
    expect(missingResult.statusCode).toBe(400);
    expect(clients.candidateIngestion.submitManualResult).not.toHaveBeenCalled();

    const missingPayload = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { authorization: 'Bearer session' },
      payload: { type: 'reindex' },
    });
    expect(missingPayload.statusCode).toBe(400);
    expect(clients.jobRuntime.schedule).not.toHaveBeenCalled();

    const nullPayload = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { authorization: 'Bearer session' },
      payload: { type: 'reindex', payload: null },
    });
    expect(nullPayload.statusCode).toBe(400);
    expect(clients.jobRuntime.schedule).not.toHaveBeenCalled();

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
      { headers: { 'x-trapmap-actor-id': 'user-1' } },
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
      { headers: { 'x-trapmap-actor-id': 'user-1' } },
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
          'x-trapmap-actor-id': 'user-1',
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
          'x-trapmap-actor-id': 'user-1',
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

  it('forwards every compatibility artifact operation with the authenticated actor', async () => {
    const clients = createClients();
    const app = await buildApp(clients);
    const headers = { authorization: 'Bearer session', 'x-request-id': 'artifact-hop' };

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/import',
        headers,
        payload: { bundles: [], actorId: 'user-1' },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers,
        payload: { artifactId: 'artifact-1', format: 'bundle-json' },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers,
        payload: { artifactId: 'artifact-1', selectedPaths: [], actorId: 'user-1' },
      }),
      app.inject({ method: 'GET', url: '/v1/operations/artifacts/review-queue', headers }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-1/edit',
        headers,
        payload: { title: 'Edited', actorId: 'user-1' },
      }),
      app.inject({ method: 'GET', url: '/v1/operations/artifacts/artifact-1/history', headers }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-1/review',
        headers,
        payload: { decision: 'approve', actorId: 'user-1' },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-1/deactivate',
        headers,
        payload: { actorId: 'user-1' },
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      201, 200, 200, 200, 200, 200, 200, 200,
    ]);
    expect(clients.knowledgeWrite.importArtifact).toHaveBeenCalledWith(
      { bundles: [] },
      {
        headers: {
          'x-request-id': 'artifact-hop',
          'x-trapmap-actor-id': 'user-1',
          'x-trapmap-actor-handle': 'alice',
          'x-trapmap-security-level': '1',
        },
      },
    );
    expect(clients.knowledgeWrite.reviewArtifact).toHaveBeenCalledWith(
      'artifact-1',
      { decision: 'approve' },
      { headers: { 'x-request-id': 'artifact-hop', 'x-trapmap-actor-id': 'user-1' } },
    );
    expect(clients.knowledgeWrite.deactivateArtifact).toHaveBeenCalledWith(
      'artifact-1',
      {},
      { headers: { 'x-request-id': 'artifact-hop', 'x-trapmap-actor-id': 'user-1' } },
    );
    await app.close();
  });

  it('attaches a candidate trusted actor header to candidate mutations', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/resolution',
      headers: { authorization: 'Bearer session', 'x-request-id': 'candidate-hop' },
      payload: { resolution: { action: 'accept' }, actorId: 'user-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(clients.candidateIngestion.applyResolution).toHaveBeenCalledWith(
      'candidate-1',
      { resolution: { action: 'accept' }, actorId: 'user-1' },
      { headers: { 'x-request-id': 'candidate-hop', 'x-trapmap-actor-id': 'user-1' } },
    );
    await app.close();
  });

  it('rejects invalid artifact command bodies before forwarding', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/operations/artifacts/artifact-1/review',
      headers: { authorization: 'Bearer session' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'validation_error',
      message: 'Request validation failed',
      kind: 'validation',
    });
    expect(clients.knowledgeWrite.reviewArtifact).not.toHaveBeenCalled();
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

  it('forwards cron routes to the cron-scheduler service', async () => {
    const clients = createClients();
    const app = await buildApp(clients);
    const headers = { authorization: 'Bearer session' };

    const listResponse = await app.inject({ method: 'GET', url: '/v1/cron/jobs', headers });
    expect(listResponse.statusCode).toBe(200);
    expect(clients.cronScheduler.listJobs).toHaveBeenCalledWith();

    const statusResponse = await app.inject({ method: 'GET', url: '/v1/cron/status', headers });
    expect(statusResponse.statusCode).toBe(200);
    expect(clients.cronScheduler.getStatus).toHaveBeenCalledWith();

    const getResponse = await app.inject({ method: 'GET', url: '/v1/cron/jobs/cron-1', headers });
    expect(getResponse.statusCode).toBe(200);
    expect(clients.cronScheduler.getJob).toHaveBeenCalledWith('cron-1');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/cron/jobs',
      headers,
      payload: { name: 'nightly', schedule: '0 3 * * *', taskType: 'reindex' },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(clients.cronScheduler.createJob).toHaveBeenCalledWith(
      { name: 'nightly', schedule: '0 3 * * *', taskType: 'reindex' },
      { headers: { 'x-trapmap-actor-id': 'user-1' } },
    );

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/v1/cron/jobs/cron-1',
      headers,
      payload: { enabled: false },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(clients.cronScheduler.updateJob).toHaveBeenCalledWith(
      'cron-1',
      { enabled: false },
      { headers: { 'x-trapmap-actor-id': 'user-1' } },
    );

    const triggerResponse = await app.inject({
      method: 'POST',
      url: '/v1/cron/jobs/cron-1/trigger',
      headers,
    });
    expect(triggerResponse.statusCode).toBe(200);
    expect(clients.cronScheduler.triggerJob).toHaveBeenCalledWith('cron-1', {
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/v1/cron/jobs/cron-1',
      headers,
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(clients.cronScheduler.deleteJob).toHaveBeenCalledWith('cron-1', {
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    await app.close();
  });

  it('rejects a cron mutation when the body actor spoofs the authenticated actor', async () => {
    const clients = createClients();
    const app = await buildApp(clients);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/cron/jobs',
      headers: { authorization: 'Bearer session' },
      payload: { name: 'nightly', actorId: 'spoofed-user' },
    });

    expect(response.statusCode).toBe(403);
    expect(clients.cronScheduler.createJob).not.toHaveBeenCalled();
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// A6: restored strict contracts (body.actorId required; empty-string queries rejected)
// ---------------------------------------------------------------------------

describe('A6 strict query contracts', () => {
  it('listTeams rejects an empty-string userId with 400', async () => {
    const clients = createClients();
    const app = await buildApp(clients);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/teams?userId=',
      headers: { authorization: 'Bearer session-token' },
    });
    expect(response.statusCode).toBe(400);
    expect(clients.identityAccess.listTeams).not.toHaveBeenCalled();
    await app.close();
  });
});
