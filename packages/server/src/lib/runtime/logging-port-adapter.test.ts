import { describe, expect, it, vi } from 'vitest';

import type { PinoLikeLogger } from './logging-port-adapter.js';
import { createLoggingPortAdapter } from './logging-port-adapter.js';

function createMockLogger(): PinoLikeLogger & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const mock: PinoLikeLogger & { calls: typeof calls } = {
    calls,
    info(...args: unknown[]) {
      calls.push({ method: 'info', args });
    },
    warn(...args: unknown[]) {
      calls.push({ method: 'warn', args });
    },
    error(...args: unknown[]) {
      calls.push({ method: 'error', args });
    },
    debug(...args: unknown[]) {
      calls.push({ method: 'debug', args });
    },
    child(_bindings: Record<string, unknown>) {
      return createMockLogger();
    },
  };

  return mock;
}

describe('LoggingPort adapter', () => {
  it('delegates info calls to the underlying logger', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.info('server started');

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({ method: 'info', args: ['server started'] });
  });

  it('passes context as pino merge object when provided', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.info('request handled', { requestId: 'abc', route: '/api' });

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({
      method: 'info',
      args: [{ requestId: 'abc', route: '/api' }, 'request handled'],
    });
  });

  it('delegates warn calls to the underlying logger', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.warn('slow query', { durationMs: 500 });

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({
      method: 'warn',
      args: [{ durationMs: 500 }, 'slow query'],
    });
  });

  it('delegates error calls to the underlying logger', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.error('connection failed', { host: 'db', port: 5432 });

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({
      method: 'error',
      args: [{ host: 'db', port: 5432 }, 'connection failed'],
    });
  });

  it('delegates debug calls to the underlying logger', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.debug('cache hit', { key: 'user:1' });

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({
      method: 'debug',
      args: [{ key: 'user:1' }, 'cache hit'],
    });
  });

  it('omits context object when context is empty', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.info('no context', {});

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].method).toBe('info');
    // adapter calls logger.info(message) with a single string arg;
    // the mock records [msg] -- no trailing undefined
    expect(mock.calls[0].args).toEqual(['no context']);
  });

  it('omits context object when context is undefined', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    adapter.warn('simple warning');

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].method).toBe('warn');
    expect(mock.calls[0].args).toEqual(['simple warning']);
  });

  it('creates a child logger that delegates child() to the underlying logger', () => {
    const mock = createMockLogger();
    const adapter = createLoggingPortAdapter(mock);

    // Use vi.spyOn to track the child() call
    const childSpy = vi.spyOn(mock, 'child').mockImplementation(() => createMockLogger());

    const childAdapter = adapter.child({ requestId: 'req-1' });

    expect(childSpy).toHaveBeenCalledWith({ requestId: 'req-1' });
    expect(childAdapter).toBeDefined();

    // The child adapter should still be a valid LoggingPort
    expect(typeof childAdapter.info).toBe('function');
    expect(typeof childAdapter.child).toBe('function');

    childSpy.mockRestore();
  });
});
