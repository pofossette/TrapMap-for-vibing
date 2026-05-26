/**
 * Duplicate-case routes.
 *
 * Endpoints:
 * - GET /v1/duplicates - List all duplicate cases
 * - GET /v1/duplicates/:candidateId - Get duplicate case for a specific candidate
 * - GET /v1/duplicates/:candidateId/bundle - Full bundle for offline review
 */

import {
  DuplicateJobBundleResponseSchema,
  duplicateCaseListResponseSchema,
  duplicateCaseResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import {
  buildDuplicateBundle,
  getDuplicateCase,
  listDuplicateCases,
} from '@trapmap/server/lib/candidates/services/query-service.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

export const candidateDuplicateRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/duplicates - List all duplicate cases
  app.get('/v1/duplicates', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const result = await listDuplicateCases({ repos: app.skillShareer.repos });

    return duplicateCaseListResponseSchema.parse(result);
  });

  // GET /v1/duplicates/:candidateId - Get duplicate case for a specific candidate
  app.get('/v1/duplicates/:candidateId', async (request) => {
    await resolveAuthContext(app.skillShareer, request);
    const candidateId = (request.params as { candidateId: string }).candidateId;

    const duplicateCase = await getDuplicateCase({ repos: app.skillShareer.repos }, candidateId);

    return duplicateCaseResponseSchema.parse({ duplicateCase });
  });

  // GET /v1/duplicates/:candidateId/bundle - Full bundle for offline review
  app.get('/v1/duplicates/:candidateId/bundle', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;

    const bundle = await buildDuplicateBundle({ repos: app.skillShareer.repos }, candidateId);

    return DuplicateJobBundleResponseSchema.parse(bundle);
  });
};
