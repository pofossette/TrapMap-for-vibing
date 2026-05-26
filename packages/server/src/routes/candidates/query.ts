/**
 * Candidate query routes.
 *
 * Endpoints:
 * - GET /v1/candidates - List candidates with optional status filter
 * - GET /v1/candidates/:candidateId - Get candidate status
 */

import { candidateListResponseSchema, candidateStatusResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import {
  getCandidate,
  listCandidates,
} from '@trapmap/server/lib/candidates/services/query-service.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

export const candidateQueryRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/candidates - List candidates with optional status filter
  app.get('/v1/candidates', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const query = request.query as { status?: string };
    const result = await listCandidates({ repos: app.skillShareer.repos }, query.status);

    return candidateListResponseSchema.parse(result);
  });

  // GET /v1/candidates/:candidateId - Get candidate status
  app.get('/v1/candidates/:candidateId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const candidateId = (request.params as { candidateId: string }).candidateId;

    const candidate = await getCandidate(
      { repos: app.skillShareer.repos },
      candidateId,
      auth.user?.id,
      auth.subjectType === 'system-admin',
    );

    return candidateStatusResponseSchema.parse({ candidate });
  });
};
