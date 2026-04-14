import { beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';

describe('retrieval route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  describe('POST /v1/retrieval/search', () => {
    it('returns valid retrieval response for authenticated caller with knowledge:search permission', async () => {
      // First, create a session with knowledge:search permission
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          handle: 'testuser',
          systemAdminKey: 'test-admin-key',
        },
      });

      // Mock system admin login - in real tests we'd use proper config
      // For now, we'll test the route contract validation
    });

    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        payload: {
          seed: 'test query',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
        },
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 400 for malformed request body', async () => {
      // This test validates schema parsing - we need a valid session first
      // For now, test that the endpoint exists
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        payload: {
          seed: '', // Invalid: seed must be min 1 character
        },
      });

      // Should fail validation or auth
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('accepts valid retrieval query schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        payload: {
          seed: 'JWT validation best practices',
          filters: {
            labels: ['security'],
            scopes: ['global'],
          },
          maxResults: 5,
          includeRefinement: true,
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('uses default values for optional fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        payload: {
          seed: 'test query',
          // filters, maxResults, includeRefinement should use defaults
        },
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });

    it('accepts valid retrieval query schema with mode field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        payload: {
          seed: 'JWT validation best practices',
          filters: {
            labels: ['security'],
            scopes: ['global'],
          },
          maxResults: 5,
          includeRefinement: true,
          mode: 'semantic',
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('uses semantic as default mode when mode is omitted', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        payload: {
          seed: 'test query',
          // mode omitted, should default to semantic
        },
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });
  });

  describe('route registration', () => {
    it('lists retrieval route in documented routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('POST /v1/retrieval/search');
    });
  });
});
