import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMetricsMiddleware } from '../../../src/nest/observability/http-metrics.middleware.js';
import type { PrometheusService } from '../../../src/nest/observability/prometheus.service.js';
import type { RequestContextService } from '../../../src/nest/runtime/request-context.service.js';

describe('HttpMetricsMiddleware', () => {
  let middleware: HttpMetricsMiddleware;
  let prometheus: PrometheusService;
  let requestContext: RequestContextService;

  beforeEach(() => {
    prometheus = {
      incrementConnections: vi.fn(),
      decrementConnections: vi.fn(),
      incrementRequests: vi.fn(),
      observeDuration: vi.fn(),
    } as PrometheusService;

    requestContext = {} as RequestContextService;

    middleware = new HttpMetricsMiddleware(prometheus, requestContext);
  });

  it('tracks active connections', () => {
    const req = {
      method: 'GET',
      routeOptions: { url: '/health' },
      url: '/health',
      headers: {},
    };
    const res = {
      raw: { on: vi.fn(), statusCode: 200 },
    };
    const next = vi.fn();

    middleware.use(req as any, res as any, next);

    expect(prometheus.incrementConnections).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('records metrics on response finish', () => {
    const finishCallback = vi.fn();
    const req = {
      method: 'GET',
      routeOptions: { url: '/health' },
      url: '/health',
      headers: {},
    };
    const res = {
      statusCode: 200,
      raw: {
        on: vi.fn((event, _cb) => {
          if (event === 'finish') finishCallback();
        }),
        statusCode: 200,
      },
    };
    const next = vi.fn();

    middleware.use(req as any, res as any, next);

    // Simulate response finish
    res.raw.on.mock.calls[0]?.[1]?.();

    expect(prometheus.incrementRequests).toHaveBeenCalledWith('GET', '/health', '200');
    expect(prometheus.decrementConnections).toHaveBeenCalled();
  });

  it('normalizes route families', () => {
    const req = {
      method: 'POST',
      routeOptions: { url: '/v1/retrieval/search' },
      url: '/v1/retrieval/search',
      headers: {},
    };
    const res = {
      statusCode: 200,
      raw: {
        on: vi.fn((event, cb) => {
          if (event === 'finish') cb();
        }),
        statusCode: 200,
      },
    };
    const next = vi.fn();

    middleware.use(req as any, res as any, next);

    // Simulate response finish
    res.raw.on.mock.calls[0]?.[1]?.();

    expect(prometheus.incrementRequests).toHaveBeenCalledWith(
      'POST',
      '/v1/retrieval/search',
      '200',
    );
  });
});
