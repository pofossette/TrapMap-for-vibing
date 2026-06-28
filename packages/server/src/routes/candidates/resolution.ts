import {
  ManualResultSubmissionSchema,
  applyResolutionResponseSchema,
  manualResultResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import {
  applyResolution,
  attachManualResult,
} from '@trapmap/server/lib/candidates/services/resolution-service.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { createLifecyclePublisher } from '@trapmap/server/lib/lifecycle/publisher.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

export const candidateResolutionRoutes: FastifyPluginAsync = async (app) => {
  const { store, eventBus, asyncTransport } = app.skillShareer;
  const lifecyclePublisher = createLifecyclePublisher(
    asyncTransport
      ? {
          store,
          eventBus,
          asyncTransport: {
            events: asyncTransport.events,
          },
        }
      : {
          store,
          eventBus,
        },
  );

  app.post('/v1/candidates/:candidateId/manual-result', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;
    const body = ManualResultSubmissionSchema.parse(request.body);
    const result = await attachManualResult(
      {
        store,
        repos: {
          candidate: app.skillShareer.repos.candidate,
          lineage: app.skillShareer.repos.lineage,
        },
        lifecyclePublisher,
        config: app.skillShareer.config,
      },
      auth,
      candidateId,
      body,
    );

    return manualResultResponseSchema.parse(result);
  });

  app.post('/v1/candidates/:candidateId/apply-resolution', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;
    try {
      const result = await applyResolution(
        {
          store,
          repos: {
            candidate: app.skillShareer.repos.candidate,
            lineage: app.skillShareer.repos.lineage,
          },
          lifecyclePublisher,
          config: app.skillShareer.config,
        },
        auth,
        candidateId,
      );

      return applyResolutionResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('not found')) {
        throw new AppError(404, 'candidate_not_found', 'Candidate not found');
      }
      throw error;
    }
  });
};
