import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvocationError } from '@trapmap/backend-core';

import { AllExceptionFilter } from './exception.filter.js';
import { RequestContextService } from './request-context.service.js';

function createMockHost(statusCode: number, body: unknown) {
  let sentStatus = 0;
  let sentBody: unknown = null;
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        get sent() {
          return false;
        },
        status(code: number) {
          sentStatus = code;
          return {
            send(payload: unknown) {
              sentBody = payload;
            },
          };
        },
      }),
    }),
    getStatus: () => sentStatus,
    getBody: () => sentBody,
  };
}

describe('AllExceptionFilter', () => {
  const requestContext = new RequestContextService();

  const filter = new AllExceptionFilter(requestContext);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should map InvocationError.notFound to 404', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.notFound('Entry not found');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(404);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('not_found');
    expect(body['kind']).toBe('not-found');
    expect(body['message']).toBe('Entry not found');
    expect(body['error']).toBe('Entry not found');
  });

  it('should map InvocationError.validation to 400', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.validation('Invalid input');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(400);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('validation_error');
    expect(body['kind']).toBe('validation');
  });

  it('should map InvocationError.forbidden to 403', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.forbidden('Access denied');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(403);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('forbidden');
    expect(body['kind']).toBe('forbidden');
  });

  it('should map InvocationError.timeout to 504', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.timeout('Request timed out');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(504);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('timeout');
    expect(body['kind']).toBe('timeout');
  });

  it('should map InvocationError.unavailable to 503', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.unavailable('Service down');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(503);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('unavailable');
    expect(body['kind']).toBe('unavailable');
  });

  it('should map InvocationError.conflict to 409', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.conflict('State conflict');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(409);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('conflict');
    expect(body['kind']).toBe('conflict');
  });

  it('should map InvocationError.internal to 500', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.internal('Unexpected failure');

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(500);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('internal_error');
    expect(body['kind']).toBe('internal');
  });

  it('should include error field as message alias for compat window', () => {
    const host = createMockHost(0, null);
    const error = InvocationError.notFound('Entry not found');

    filter.catch(error, host as never);

    const body = host.getBody() as Record<string, unknown>;
    expect(body['error']).toBe(body['message']);
  });

  it('should map unknown errors to 500 internal_error', () => {
    const host = createMockHost(0, null);
    const error = new Error('something broke');
    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    filter.catch(error, host as never);

    expect(host.getStatus()).toBe(500);
    const body = host.getBody() as Record<string, unknown>;
    expect(body['code']).toBe('internal_error');
    expect(body['kind']).toBe('internal');
    expect(loggerSpy).toHaveBeenCalledWith('Unhandled exception', error);
  });
});
