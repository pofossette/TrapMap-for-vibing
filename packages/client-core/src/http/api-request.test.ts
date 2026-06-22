import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionProvider } from '@trapmap/client-core/session/session-provider.js';
import { ApiError, apiRequest } from './index.js';

function makeProvider(overrides: Partial<SessionProvider> = {}): SessionProvider {
  return {
    getBaseUrl: () => overrides.getBaseUrl?.() ?? 'http://localhost:4000',
    getSessionToken: () => overrides.getSessionToken?.() ?? null,
  };
}

describe('ApiError', () => {
  it('should set statusCode, payload, and message', () => {
    const payload = { error: 'test error' };
    const error = new ApiError(404, payload, 'Not found');

    expect(error.statusCode).toBe(404);
    expect(error.payload).toBe(payload);
    expect(error.message).toBe('Not found');
  });

  it('should be an instance of Error', () => {
    const error = new ApiError(500, { error: 'server error' }, 'Server error');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('apiRequest', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('URL construction', () => {
    it('should use provider.getBaseUrl() as the default base', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/test', expect.any(Object));
    });

    it('should prefer options.baseUrl over provider.getBaseUrl()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), {
        path: '/api/test',
        baseUrl: 'http://custom:5000',
      });

      expect(mockFetch).toHaveBeenCalledWith('http://custom:5000/api/test', expect.any(Object));
    });
  });

  describe('HTTP method handling', () => {
    it('should default to GET', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should use POST when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), { path: '/api/test', method: 'POST' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should use PATCH when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ updated: true })),
      });

      const result = await apiRequest<{ updated: boolean }>(makeProvider(), {
        path: '/api/test/1',
        method: 'PATCH',
        body: { name: 'updated' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/test/1',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(result.data).toEqual({ updated: true });
    });
  });

  describe('Header handling', () => {
    it('should set content-type for requests with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), {
        path: '/api/test',
        method: 'POST',
        body: { data: 'test' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'content-type': 'application/json' }),
        }),
      );
    });

    it('should omit content-type for requests without body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), { path: '/api/test' });

      const callArgs = mockFetch.mock.calls[0]![1];
      expect(callArgs.headers).not.toHaveProperty('content-type');
    });

    it('should set authorization from provider.getSessionToken()', async () => {
      const provider = makeProvider({ getSessionToken: () => 'state-token-123' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(provider, { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer state-token-123' }),
        }),
      );
    });

    it('should prefer options.sessionToken over provider token', async () => {
      const provider = makeProvider({ getSessionToken: () => 'state-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(provider, { path: '/api/test', sessionToken: 'override-token' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer override-token' }),
        }),
      );
    });

    it('should omit authorization when no token is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(makeProvider(), { path: '/api/test' });

      const callArgs = mockFetch.mock.calls[0]![1];
      expect(callArgs.headers).not.toHaveProperty('authorization');
    });
  });

  describe('Response handling', () => {
    it('should parse JSON response body', async () => {
      const responseData = { id: 1, name: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(responseData)),
      });

      const result = await apiRequest<{ id: number; name: string }>(makeProvider(), {
        path: '/api/test',
      });

      expect(result.data).toEqual(responseData);
    });

    it('should return sessionToken from x-session-token header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'x-session-token' ? 'new-session-token' : null),
        },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      const result = await apiRequest(makeProvider(), { path: '/api/test' });

      expect(result.sessionToken).toBe('new-session-token');
    });

    it('should handle empty response body (null payload)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      });

      const result = await apiRequest<null>(makeProvider(), { path: '/api/test' });

      expect(result.data).toBeNull();
    });
  });

  describe('Network failures', () => {
    it('should include the request URL when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(apiRequest(makeProvider(), { path: '/v1/auth/session' })).rejects.toMatchObject({
        statusCode: 0,
        message: 'Request to http://localhost:4000/v1/auth/session failed: fetch failed',
      });
    });
  });

  describe('Error handling', () => {
    it('should throw ApiError for non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ message: 'Not found' })),
      });

      await expect(apiRequest(makeProvider(), { path: '/api/test' })).rejects.toThrow(ApiError);
    });

    it('should extract message from error payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ message: 'Bad request data' })),
      });

      try {
        await apiRequest(makeProvider(), { path: '/api/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Bad request data');
      }
    });

    it('should fall back to status code message when no payload message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: 'unknown' })),
      });

      try {
        await apiRequest(makeProvider(), { path: '/api/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Request failed with status 500');
      }
    });

    it('should throw 502 ApiError for malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve('{invalid json!!'),
      });

      try {
        await apiRequest(makeProvider(), { path: '/api/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(502);
        expect((error as ApiError).message).toMatch(
          /Invalid JSON response from http:\/\/localhost:4000\/api\/test/,
        );
        expect((error as ApiError).payload).toEqual({ rawBody: '{invalid json!!' });
      }
    });
  });

  describe('Body serialization', () => {
    it('should JSON stringify body when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      const body = { foo: 'bar', nested: { value: 123 } };
      await apiRequest(makeProvider(), {
        path: '/api/test',
        method: 'POST',
        body,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify(body) }),
      );
    });
  });
});
