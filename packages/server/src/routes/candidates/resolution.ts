/**
 * Candidate resolution routes.
 *
 * Endpoints:
 * - POST /v1/candidates/:candidateId/manual-result - Submit manual resolution
 * - POST /v1/candidates/:candidateId/apply-resolution - Apply manual resolution
 */

import { ManualResultSubmissionSchema, manualResultResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { attachManualResult } from '@trapmap/server/lib/candidates/services/resolution-service.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { createLifecyclePublisher } from '@trapmap/server/lib/lifecycle/publisher.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

import { sendCompatibilityShellUnsupported } from '@trapmap/server/routes/compatibility-shell.js';

export const candidateResolutionRoutes: FastifyPluginAsync = async (app) => {
  const { store, eventBus, asyncTransport } = app.skillShareer;
  const lifecyclePublisher = createLifecyclePublisher(
    asyncTransport
      ? {
          store,
          eventBus,
          asyncTransport,
        }
      : {
          store,
          eventBus,
        },
  );

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
        lifecyclePublisher,
        config: app.skillShareer.config,
      },
      auth,
      candidateId,
      body,
    );

    return manualResultResponseSchema.parse(result);
  });

  // POST /v1/candidates/:candidateId/apply-resolution - Apply manual resolution
  app.post('/v1/candidates/:candidateId/apply-resolution', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    return sendCompatibilityShellUnsupported(
      reply,
      'candidate resolution writes',
      'host-distributed authoritative candidate resolution service',
    );
  });
};
