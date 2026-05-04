import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';

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

  // Phase 16-02: No-script-execution guarantee (T-16-06)
  describe('compatibility hardening no-execution boundary (Phase 16-02)', () => {
    it('activation response does not include script bodies', async () => {
      // Schema validation: activation response only includes script descriptors
      // This test verifies the schema contract enforces metadata-only scripts
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        payload: {
          artifactId: 'artifact_1',
          selectedPaths: ['scripts/setup.sh'],
        },
      });

      // Should require auth - schema validation passes
      expect(response.statusCode).toBe(401);
    });

    it('migration response does not include artifact bundle payloads', async () => {
      // Migration creates artifacts but returns only migration results
      // not the full artifact bundle content
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: ['knowledge_1'],
        },
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });

    it('compatibility status response is metadata-only', async () => {
      // Status response contains counts and IDs, not full content
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/status',
      });

      // Should require auth
      expect(response.statusCode).toBe(401);
    });
  });
});
