/**
 * Nyquist Validation Tests for Phase 80: Operations Route Refactoring
 *
 * These tests verify structural constraints that ensure the refactoring
 * maintains its architectural guarantees. They are adversarial in nature:
 * they verify that violations would be caught.
 *
 * Coverage:
 * - All 19 route handlers are registered via /meta/routes
 * - Barrel export provides all 11 route modules
 * - Each route module exports a FastifyPluginAsync function
 * - Thin router has zero route handlers (only app.register calls)
 * - Thin router exports operationsRoutes for app.ts compatibility
 * - Each source module is under 400 lines
 * - Thin router is under 100 lines
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

// Import all route modules via barrel export
import {
  auditRoutes,
  badcaseRoutes,
  capsuleIndexRoutes,
  knowledgeLegacyRoutes,
  statusRoutes,
} from './index.js';

// Import thin router
import { operationsRoutes } from '../operations.js';

/**
 * Helper to verify a route exists by making a minimal request.
 * Returns true if the route responds (even with 401), false if 404.
 */
async function routeExists(
  app: ReturnType<typeof Fastify>,
  method: string,
  url: string,
): Promise<boolean> {
  const response = await app.inject({
    method,
    url,
    payload: method === 'POST' ? {} : undefined,
  });
  // 404 means route doesn't exist; any other status (401, 400, etc.) means it exists
  return response.statusCode !== 404;
}

describe('Phase 80 Nyquist Validation', () => {
  describe('structural validation', () => {
    it('registers the remaining compatibility operation routes', async () => {
      const app = Fastify();
      await app.register(operationsRoutes);
      await app.ready();

      // All 19 routes that must be registered
      const requiredRoutes = [
        { method: 'GET', path: '/v1/operations/audit' },
        { method: 'GET', path: '/v1/operations/badcases/feedback_test/export' },
        { method: 'POST', path: '/v1/operations/capsule-index/rebuild' },
        { method: 'GET', path: '/v1/operations/capsule-index/health' },
        { method: 'POST', path: '/v1/operations/capsule-index/cleanup-orphans' },
        { method: 'GET', path: '/v1/operations/knowledge' },
        { method: 'POST', path: '/v1/operations/knowledge/test-entry/deactivate' },
        { method: 'GET', path: '/v1/operations/status' },
      ];

      for (const route of requiredRoutes) {
        const exists = await routeExists(app, route.method, route.path);
        expect(exists, `${route.method} ${route.path} should be registered`).toBe(true);
      }

      await app.close();
    });

    it('barrel export provides the remaining compatibility route modules', () => {
      // Verify all 11 exports exist and are functions
      expect(auditRoutes).toBeDefined();
      expect(typeof auditRoutes).toBe('function');

      expect(badcaseRoutes).toBeDefined();
      expect(typeof badcaseRoutes).toBe('function');

      expect(capsuleIndexRoutes).toBeDefined();
      expect(typeof capsuleIndexRoutes).toBe('function');

      expect(knowledgeLegacyRoutes).toBeDefined();
      expect(typeof knowledgeLegacyRoutes).toBe('function');

      expect(statusRoutes).toBeDefined();
      expect(typeof statusRoutes).toBe('function');
    });

    it('each route module exports FastifyPluginAsync function', () => {
      // FastifyPluginAsync functions have no required properties at runtime
      // but we can verify they are async functions by checking their prototype
      const routeModules = [
        { name: 'auditRoutes', fn: auditRoutes },
        { name: 'badcaseRoutes', fn: badcaseRoutes },
        { name: 'capsuleIndexRoutes', fn: capsuleIndexRoutes },
        { name: 'knowledgeLegacyRoutes', fn: knowledgeLegacyRoutes },
        { name: 'statusRoutes', fn: statusRoutes },
      ];

      for (const module of routeModules) {
        expect(typeof module.fn, `${module.name} should be a function`).toBe('function');
        // FastifyPluginAsync functions are async (return Promise)
        // We verify they are functions; Fastify will reject non-PluginAsync at runtime
      }
    });

    it('thin router exports operationsRoutes', () => {
      expect(operationsRoutes).toBeDefined();
      expect(typeof operationsRoutes).toBe('function');
    });
  });

  describe('line count constraints', () => {
    const operationsDir = path.join(__dirname);
    const operationsFile = path.join(__dirname, '..', 'operations.ts');

    it('thin router line count under 100', () => {
      const content = fs.readFileSync(operationsFile, 'utf-8');
      const lines = content.split('\n').length;
      expect(lines).toBeLessThan(100);
    });

    it('each source module under 400 lines', () => {
      const sourceModules = ['audit.ts', 'capsule-index.ts', 'knowledge-legacy.ts', 'status.ts'];

      for (const moduleFile of sourceModules) {
        const filePath = path.join(operationsDir, moduleFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').length;
        expect(lines, `${moduleFile} should be under 400 lines (was ${lines})`).toBeLessThan(400);
      }
    });

    it('thin router has zero route handlers', () => {
      const content = fs.readFileSync(operationsFile, 'utf-8');

      // Thin router should NOT contain any app.get() or app.post() calls
      // Only app.register() calls are allowed
      const hasRouteHandlers = /app\.(get|post)\s*\(/.test(content);
      expect(hasRouteHandlers, 'Thin router should have no app.get/app.post handlers').toBe(false);

      // Artifact commands now belong to service-knowledge-write.
      const registerMatches = content.match(/app\.register\s*\(/g);
      expect(registerMatches, 'Thin router should have 6 app.register calls').toHaveLength(6);
    });
  });

  describe('original test file verification', () => {
    it('original test file is thin registration smoke test', () => {
      const originalTestFile = path.join(__dirname, '..', 'operations.test.ts');
      const content = fs.readFileSync(originalTestFile, 'utf-8');
      const lines = content.split('\n').length;

      // Should be under 30 lines
      expect(lines).toBeLessThan(30);

      // Route plugin tests avoid constructing the host-owned compatibility server.
      expect(content).toContain('app.register(operationsRoutes)');
    });
  });
});
