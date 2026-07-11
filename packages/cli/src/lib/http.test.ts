import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliState } from './config.js';
import { ApiError, apiRequest, requireSessionToken } from './http.js';

describe('ApiError', () => {
  describe('constructor sets properties', () => {
    it('should set statusCode, payload, and message properties', () => {
      const payload = { error: 'test error' };
      const error = new ApiError(404, payload, 'Not found');

      expect(error.statusCode).toBe(404);
      expect(error.payload).toBe(payload);
      expect(error.message).toBe('Not found');
    });
  });

  describe('instanceof Error check', () => {
    it('should be an instance of Error', () => {
      const error = new ApiError(500, { error: 'server error' }, 'Server error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
    });
  });

  describe('message is set correctly', () => {
    it('should preserve custom message passed to constructor', () => {
      const customMessage = 'Custom error message for testing';
      const error = new ApiError(400, {}, customMessage);

      expect(error.message).toBe(customMessage);
    });
  });
});

describe('apiRequest', () => {
  const defaultState: CliState = {
    gatewayUrl: 'http://localhost:4000',
    sessionToken: null,
    session: null,
  };

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('URL construction', () => {
    it('should use state.gatewayUrl when override not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/test', expect.any(Object));
    });

    it('uses the same gateway URL for a heavy backend target', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest({ ...defaultState, backendTarget: 'heavy' }, { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/test', expect.any(Object));
    });

    it('should use options.gatewayUrl when provided (override)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, {
        path: '/api/test',
        gatewayUrl: 'http://custom-server:5000',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-server:5000/api/test',
        expect.any(Object),
      );
    });

    it('should construct correct path with query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test?foo=bar&baz=qux' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/test?foo=bar&baz=qux',
        expect.any(Object),
      );
    });
  });

  describe('HTTP method handling', () => {
    it('should default to GET when method not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should use POST method when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test', method: 'POST' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should use PATCH method when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test', method: 'PATCH' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('Header handling', () => {
    it('should set content-type for requests with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, {
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
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test' });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).not.toHaveProperty('content-type');
    });

    it('should set authorization header from state.sessionToken', async () => {
      const stateWithToken: CliState = {
        ...defaultState,
        sessionToken: 'state-token-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(stateWithToken, { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer state-token-123' }),
        }),
      );
    });

    it('should set authorization header from options.sessionToken (override)', async () => {
      const stateWithToken: CliState = {
        ...defaultState,
        sessionToken: 'state-token-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(stateWithToken, {
        path: '/api/test',
        sessionToken: 'override-token-456',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer override-token-456' }),
        }),
      );
    });

    it('should omit authorization when no token available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await apiRequest(defaultState, { path: '/api/test' });

      const callArgs = mockFetch.mock.calls[0][1];
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

      const result = await apiRequest<{ id: number; name: string }>(defaultState, {
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
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      const result = await apiRequest(defaultState, { path: '/api/test' });

      expect(result.sessionToken).toBe('new-session-token');
    });

    it('should handle empty response body (null payload)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      });

      const result = await apiRequest<null>(defaultState, { path: '/api/test' });

      expect(result.data).toBeNull();
    });
  });

  describe('network failures', () => {
    it('should include the request URL when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(apiRequest(defaultState, { path: '/v1/auth/session' })).rejects.toMatchObject({
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

      await expect(apiRequest(defaultState, { path: '/api/test' })).rejects.toThrow(ApiError);
    });

    it('should extract message from error payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ message: 'Bad request data' })),
      });

      try {
        await apiRequest(defaultState, { path: '/api/test' });
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
        await apiRequest(defaultState, { path: '/api/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Request failed with status 500');
      }
    });
  });

  describe('Body serialization', () => {
    it('should JSON stringify body when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      const body = { foo: 'bar', nested: { value: 123 } };
      await apiRequest(defaultState, {
        path: '/api/test',
        method: 'POST',
        body,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(body),
        }),
      );
    });
  });
});

describe('requireSessionToken', () => {
  it('should return token when sessionToken exists', () => {
    const state: CliState = {
      gatewayUrl: 'http://localhost:4000',
      sessionToken: 'valid-token-123',
      session: null,
    };

    const token = requireSessionToken(state);

    expect(token).toBe('valid-token-123');
  });

  it('should throw Error when sessionToken is null', () => {
    const state: CliState = {
      gatewayUrl: 'http://localhost:4000',
      sessionToken: null,
      session: null,
    };

    expect(() => requireSessionToken(state)).toThrow();
  });

  it('rejects numeric sessionToken', () => {
    expect(() => requireSessionToken({ sessionToken: 123 } as any)).toThrow('Not authenticated');
  });

  it('rejects empty string sessionToken', () => {
    expect(() => requireSessionToken({ sessionToken: '' } as any)).toThrow('Not authenticated');
  });

  it('should have error message mentioning login command', () => {
    const state: CliState = {
      gatewayUrl: 'http://localhost:4000',
      sessionToken: null,
      session: null,
    };

    try {
      requireSessionToken(state);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('login');
    }
  });
});
