/**
 * Candidate resolution routes.
 *
 * Endpoints:
 * - POST /v1/candidates/:candidateId/manual-result - Submit manual resolution
 * - POST /v1/candidates/:candidateId/apply-resolution - Apply manual resolution
 */

import {
  ManualResultSubmissionSchema,
  applyResolutionResponseSchema,
  manualResultResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import {
  attachManualResult,
  applyResolution,
} from '@trapmap/server/lib/candidates/services/resolution-service.js';

export const candidateResolutionRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/candidates/:candidateId/manual-result - Submit manual resolution
  app.post('/v1/candidates/:candidateId/manual-result', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;

    if (!auth.user?.id) {
      throw new AppError(403, 'user_required', 'Manual result requires a real user account');
    }

    const body = ManualResultSubmissionSchema.parse(request.body);

    const result = await attachManualResult(
      {
        store: app.skillShareer.store,
        repos: app.skillShareer.repos,
        eventBus: app.skillShareer.eventBus,
        config: app.skillShareer.config,
      },
      auth,
      candidateId,
      body,
    );

    return manualResultResponseSchema.parse(result);
  });

  // POST /v1/candidates/:candidateId/apply-resolution - Apply manual resolution
  app.post('/v1/candidates/:candidateId/apply-resolution', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;

    const result = await applyResolution(
      {
        store: app.skillShareer.store,
        repos: app.skillShareer.repos,
        eventBus: app.skillShareer.eventBus,
        config: app.skillShareer.config,
      },
      auth,
      candidateId,
    );

    return applyResolutionResponseSchema.parse(result);
  });
};
