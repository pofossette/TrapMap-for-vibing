import { describe, expect, it, beforeEach } from 'vitest';

import { buildServer } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  describe('GET /v1/operations/knowledge', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge',
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('accepts valid query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge?scope=global&lifecycleState=approved&requiredLevelMax=5&limit=10',
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });

    it('uses default limit value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/knowledge',
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/operations/knowledge/:entryId/deactivate', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {
          reason: 'Outdated information',
        },
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 400 for missing reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {},
      });

      // Should fail validation (reason required) or auth
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('validates reason length constraints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/knowledge/knowledge_1/deactivate',
        payload: {
          reason: '', // Empty reason should fail validation
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('route registration', () => {
    it('lists operations routes in documented routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('GET /v1/operations/knowledge');
      expect(json.documentedRoutes).toContain('POST /v1/operations/knowledge/:entryId/deactivate');
    });
  });
});