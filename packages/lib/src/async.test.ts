import { afterEach, describe, expect, it, vi } from 'vitest';

import { timeout } from './async.js';

describe('timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the promise value when it settles first', async () => {
    await expect(timeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('rejects with the promise error when it rejects first', async () => {
    await expect(timeout(Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
  });

  it('rejects with a Timeout error when the timeout elapses first', async () => {
    await expect(timeout(new Promise(() => {}), 20)).rejects.toThrow('Timeout after 20ms');
  });

  it('uses a custom message when provided', async () => {
    await expect(timeout(new Promise(() => {}), 20, 'custom timeout')).rejects.toThrow(
      'custom timeout',
    );
  });

  it('clears the timer after the promise resolves', async () => {
    vi.useFakeTimers();
    const result = timeout(Promise.resolve('done'), 1000);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer after the promise rejects', async () => {
    vi.useFakeTimers();
    const result = timeout(Promise.reject(new Error('nope')), 1000).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
