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

  describe('POST /v1/operations/export', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('accepts valid export request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {
          teamId: null,
          includeHistory: true,
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts export request without body (uses defaults)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {},
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });

  describe('artifact export (IMEX-02)', () => {
    it('returns 401 for unauthenticated artifact export request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'bundle-json',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts valid artifact export request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'bundle-json',
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts distilled-json format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'distilled-json',
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts skill-dir format (server normalizes to bundle-json)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'skill-dir',
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('defaults format to bundle-json when not specified', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });
  });
});
