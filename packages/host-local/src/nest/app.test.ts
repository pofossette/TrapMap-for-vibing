import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import type { KnowledgeReadPort } from '@trapmap/backend-core';

import { GatewayModule } from './gateway/gateway.module.js';
import { KnowledgeReadModule } from './knowledge-read/knowledge-read.module.js';
import { AllExceptionFilter } from './runtime/exception.filter.js';
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

async function createTestApp(mockPort: KnowledgeReadPort) {
  const moduleRef = await Test.createTestingModule({
    imports: [KnowledgeReadModule.forTesting(mockPort), GatewayModule],
    providers: [RequestContextService],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  const requestContext = moduleRef.get(RequestContextService);
  app.useGlobalFilters(new AllExceptionFilter(requestContext));

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('Nest host scaffold (pilot surface)', () => {
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
    expect(entry['entryId']).toBe('entry-1');
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
    expect(result['results']).toHaveLength(1);
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
    expect(status['phase']).toBe('phase-2-boundary-closed');
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
    expect(body['code']).toBe('not_found');
    expect(body['kind']).toBe('not-found');
    expect(body['requestId']).toBeDefined();
    // Compat window: error field as message alias
    expect(body['error']).toBe(body['message']);

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
    expect(body['code']).toBe('validation_error');
    expect(body['kind']).toBe('validation');

    await app.close();
  });
});
