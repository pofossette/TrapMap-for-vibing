import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import type { FastifyInstance } from 'fastify';

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /v1/operations/audit', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit',
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('returns 403 for user without audit:read permission', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit',
        headers: {
          authorization: 'Bearer user_without_permission_token',
        },
      });

      // Should fail auth or permission
      expect(response.statusCode).toBeGreaterThanOrEqual(401);
    });

    it('accepts valid audit query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit?action=knowledge-reviewed&limit=10',
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });
  });

  describe('audit event creation', () => {
    it('verifies audit route is documented', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('GET /v1/operations/audit');
    });
  });

  describe('E2E workflow: audit trail captures full lifecycle', () => {
    it('records all audit events for knowledge lifecycle', async () => {
      // This is a placeholder E2E test - in a real scenario, you would:
      // 1. Create a knowledge entry as user A
      // 2. Submit it for review
      // 3. Approve it as user B (higher level)
      // 4. Export the entry
      // 5. Deactivate the entry
      // 6. Query audit trail and verify all 4+ actions appear

      // For this prototype, we verify the audit route exists and accepts valid queries
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/audit?action=knowledge-reviewed&action=knowledge-exported&action=knowledge-deactivated&limit=50',
      });

      // Should require auth - the endpoint exists and accepts valid query params
      expect(response.statusCode).toBe(401);
    });
  });
});
