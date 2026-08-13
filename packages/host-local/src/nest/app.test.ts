import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import type { CandidateIngestionPort, KnowledgeReadPort, ReviewPort } from '@trapmap/backend-core';

import { GatewayModule } from './gateway/gateway.module.js';
import { KnowledgeReadModule } from './knowledge-read/knowledge-read.module.js';
import { AllExceptionFilter } from './runtime/exception.filter.js';
import type { HostLocalRuntime } from './runtime/host-runtime.js';
import { RequestContextService } from './runtime/request-context.service.js';

function createMockPort(): KnowledgeReadPort {
  return {
    getById: vi.fn().mockResolvedValue({
      entryId: 'entry-1',
      title: 'Test Entry',
      content: 'Test content',
      labels: ['test'],
      lifecycleState: 'approved',
    }),
    listMine: vi.fn().mockResolvedValue([
      {
        entryId: 'entry-1',
        title: 'Test Entry',
        content: 'Test content',
        labels: ['test'],
        lifecycleState: 'approved',
      },
    ]),
    search: vi.fn().mockResolvedValue({
      results: [{ entryId: 'entry-1', score: 0.95, snippet: 'test snippet' }],
      totalEstimate: 1,
      channel: 'semantic',
    }),
    getProjectionStatus: vi.fn().mockResolvedValue({
      phase: 'phase-2-boundary-closed',
      source: 'test',
      consistency: 'strong',
      freshness: 'current',
      fallback: 'none',
      surfaces: [],
    }),
  };
}

function createMockCandidatePort(): CandidateIngestionPort {
  return {
    submit: vi.fn(),
    getById: vi.fn().mockResolvedValue(null),
    listByStatus: vi.fn(),
    applyResolution: vi.fn(),
    submitManualResult: vi.fn().mockResolvedValue(undefined),
    publishCandidateResult: vi.fn(),
  };
}

function createMockReviewPort(): ReviewPort {
  return {
    approve: vi.fn(),
    reject: vi.fn(),
    applyMaintenance: vi.fn(),
    applyDecay: vi.fn(),
    reviewArtifact: vi.fn(),
    submitFeedback: vi.fn(),
  };
}

function createMockRuntime(): HostLocalRuntime {
  return {
    services: {
      identity: {
        sessionRepo: {
          getByTokenHash: vi.fn(async () => ({
            subjectType: 'user',
            userId: 'user-1',
            activeTeamId: null,
          })),
        },
        userRepo: {
          getById: vi.fn(async () => ({ id: 'user-1', handle: 'alice' })),
        },
        membershipRepo: {
          listByUser: vi.fn(async () => []),
        },
        teamRepo: {
          getById: vi.fn(),
        },
      },
      runtimeDeployment: {
        capabilities: { supportsLocalSingleUserMode: true },
      },
      knowledgeOwner: {
        getById: vi.fn(async () => ({ id: 'entry-1', lifecycleState: 'approved' })),
        listByFilter: vi.fn(async () => []),
      },
    },
  };
}

async function createTestApp(
  mockPort: KnowledgeReadPort,
  candidatePort: CandidateIngestionPort = createMockCandidatePort(),
  reviewPort: ReviewPort = createMockReviewPort(),
) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      KnowledgeReadModule.forTesting(mockPort),
      GatewayModule.forRuntime(createMockRuntime(), {
        knowledgeRead: mockPort,
        candidateIngestion: candidatePort,
        governanceReview: reviewPort,
      }),
    ],
    providers: [RequestContextService],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  const requestContext = moduleRef.get(RequestContextService);
  app.useGlobalFilters(new AllExceptionFilter(requestContext));

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('Nest host gateway surface (RouteDef-driven)', () => {
  it('should serve GET /v1/knowledge/:entryId via in-process port', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/v1/knowledge/entry-1',
        headers: { authorization: 'Bearer test-token' },
      });
    expect(response.statusCode).toBe(200);
    const entry = JSON.parse(response.payload);
    expect(entry.entryId).toBe('entry-1');
    expect(mockPort.getById).toHaveBeenCalledWith('entry-1');

    await app.close();
  });

  it('should serve GET /v1/knowledge/mine via in-process port', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/v1/knowledge/mine?userId=user-1',
        headers: { authorization: 'Bearer test-token' },
      });
    expect(response.statusCode).toBe(200);
    expect(mockPort.listMine).toHaveBeenCalledWith('user-1', undefined);

    await app.close();
  });

  it('should serve POST /v1/retrieval/search via in-process port', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ query: 'test query', limit: 10 }),
      });
    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.payload);
    expect(result.results).toHaveLength(1);
    expect(mockPort.search).toHaveBeenCalledWith({
      query: 'test query',
      limit: 10,
    });

    await app.close();
  });

  it('should serve GET /v1/knowledge/projection-status via in-process port', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/v1/knowledge/projection-status',
        headers: { authorization: 'Bearer test-token' },
      });
    expect(response.statusCode).toBe(200);
    const status = JSON.parse(response.payload);
    expect(status.phase).toBe('phase-2-boundary-closed');
    expect(mockPort.getProjectionStatus).toHaveBeenCalled();

    await app.close();
  });

  it('should return 401 when authorization header is missing', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/v1/knowledge/entry-1',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('should return 404 with canonical envelope for non-existent entry', async () => {
    const mockPort: KnowledgeReadPort = {
      getById: vi.fn().mockResolvedValue(null),
      listMine: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue({ results: [] }),
      getProjectionStatus: vi.fn().mockResolvedValue({
        phase: 'phase-2-boundary-closed',
        source: 'test',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'none',
        surfaces: [],
      }),
    };
    const app = await createTestApp(mockPort);

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/v1/knowledge/nonexistent',
        headers: { authorization: 'Bearer test-token' },
      });
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe('not_found');
    expect(body.kind).toBe('not-found');
    expect(body.requestId).toBeDefined();
    // Compat window: error field as message alias
    expect(body.error).toBe(body.message);

    await app.close();
  });

  it('should return 400 with canonical envelope for invalid search body', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({}),
      });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe('validation_error');
    expect(body.kind).toBe('validation');

    await app.close();
  });

  it('should not expose any /internal/* routes on the monolith HTTP surface', async () => {
    const mockPort = createMockPort();
    const app = await createTestApp(mockPort);
    const fastifyApp = app.getHttpAdapter().getInstance() as {
      inject(input: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        payload?: unknown;
      }): Promise<{ statusCode: number }>;
    };

    const responses = await Promise.all([
      fastifyApp.inject({
        method: 'GET',
        url: '/internal/knowledge/entry-1',
        headers: { authorization: 'Bearer test-token' },
      }),
      fastifyApp.inject({
        method: 'GET',
        url: '/internal/knowledge/mine?userId=user-1',
        headers: { authorization: 'Bearer test-token' },
      }),
      fastifyApp.inject({
        method: 'POST',
        url: '/internal/feedback/admin',
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      }),
      fastifyApp.inject({
        method: 'POST',
        url: '/internal/candidates',
        headers: { authorization: 'Bearer test-token' },
        payload: { id: 'candidate-1', content: 'x', submittedBy: 'user-1' },
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
    }

    await app.close();
  });
});
