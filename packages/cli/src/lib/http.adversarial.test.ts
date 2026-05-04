/**
 * Adversarial tests for CLI HTTP client error handling and response parsing.
 * Phase 71 Gap 1: Verifies edge cases in error handling, response parsing,
 * and authentication that existing tests may not cover deeply enough.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliState } from './config.js';
import { ApiError, apiRequest, requireSessionToken } from './http.js';

describe('HTTP client adversarial tests', () => {
  const defaultState: CliState = {
    serverUrl: 'http://localhost:4000',
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

  describe('apiRequest error handling edge cases', () => {
    it('should throw ApiError with correct statusCode when server returns 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ message: 'Forbidden' })),
      });

      try {
        await apiRequest(defaultState, { path: '/api/protected' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiErr = error as ApiError;
        expect(apiErr.statusCode).toBe(403);
        expect(apiErr.message).toBe('Forbidden');
        expect(apiErr.payload).toEqual({ message: 'Forbidden' });
      }
    });

    it('should propagate fetch network errors (rejected promise)', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(apiRequest(defaultState, { path: '/api/test' })).rejects.toThrow(TypeError);
    });

    it('should throw SyntaxError on non-JSON response body (unprotected parse)', async () => {
      // The implementation calls JSON.parse(text) without try/catch,
      // so non-JSON text on the error path throws SyntaxError before
      // the !response.ok check can create an ApiError.
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(apiRequest(defaultState, { path: '/api/test' })).rejects.toThrow(SyntaxError);
    });

    it('should extract message from nested error payload with message field', async () => {
      const payload = { message: 'Validation failed', errors: ['field required'] };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(payload)),
      });

      try {
        await apiRequest(defaultState, { path: '/api/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Validation failed');
        // Verify the full payload is preserved
        expect((error as ApiError).payload).toEqual(payload);
      }
    });

    it('should use fallback message when error payload has no message field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: 'bad gateway', code: 502 })),
      });

      try {
        await apiRequest(defaultState, { path: '/api/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Request failed with status 502');
      }
    });
  });

  describe('apiRequest response parsing edge cases', () => {
    it('should return null data when response body is empty string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(''),
      });

      const result = await apiRequest(defaultState, { path: '/api/test' });
      expect(result.data).toBeNull();
    });

    it('should return null sessionToken when header is absent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      const result = await apiRequest(defaultState, { path: '/api/test' });
      expect(result.sessionToken).toBeNull();
    });

    it('should return sessionToken from x-session-token header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'x-session-token' ? 'tk-12345' : null),
        },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      const result = await apiRequest(defaultState, { path: '/api/test' });
      expect(result.sessionToken).toBe('tk-12345');
    });

    it('should correctly parse complex JSON objects', async () => {
      const complexData = {
        items: [{ id: 1, nested: { deep: true } }],
        meta: { total: 1, page: 1 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(complexData)),
      });

      const result = await apiRequest<typeof complexData>(defaultState, { path: '/api/test' });
      expect(result.data).toEqual(complexData);
      expect(result.data.items[0].nested.deep).toBe(true);
    });
  });

  describe('requireSessionToken edge cases', () => {
    it('should throw error with exact login command message', () => {
      const state: CliState = {
        serverUrl: 'http://localhost:4000',
        sessionToken: null,
        session: null,
      };

      expect(() => requireSessionToken(state)).toThrow(
        'Not authenticated. Run `skill-shareer login` first.',
      );
    });

    it('should return the exact token string when present', () => {
      const token = 'bearer-abc-123-def-456';
      const state: CliState = {
        serverUrl: 'http://localhost:4000',
        sessionToken: token,
        session: null,
      };

      expect(requireSessionToken(state)).toBe(token);
    });
  });

  describe('apiRequest token precedence', () => {
    it('should prefer options.sessionToken over state.sessionToken', async () => {
      const stateWithToken: CliState = {
        serverUrl: 'http://localhost:4000',
        sessionToken: 'state-token',
        session: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(stateWithToken, {
        path: '/api/test',
        sessionToken: 'options-token',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer options-token' }),
        }),
      );
    });

    it('should use state token when options.sessionToken is undefined', async () => {
      const stateWithToken: CliState = {
        serverUrl: 'http://localhost:4000',
        sessionToken: 'state-token',
        session: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      });

      await apiRequest(stateWithToken, { path: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer state-token' }),
        }),
      );
    });
  });
});
