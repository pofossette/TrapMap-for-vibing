import { toInvocationErrorResponse } from '@trapmap/backend-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ArtifactReadProjection, ArtifactWritePort } from './artifact-ports.js';

export function registerArtifactRoutes(
  app: FastifyInstance,
  artifacts: ArtifactWritePort,
  readProjection: ArtifactReadProjection,
): void {
  app.post('/internal/artifacts/import', async (request, reply) => {
    try {
      return reply
        .status(201)
        .send(await artifacts.importArtifact((request.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.post('/internal/artifacts/export', async (request, reply) => {
    try {
      return reply
        .status(200)
        .send(
          await readProjection.exportArtifacts((request.body ?? {}) as Record<string, unknown>),
        );
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.get('/internal/artifacts/review-queue', async (_request, reply) => {
    try {
      return reply.status(200).send(await readProjection.reviewQueue());
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.get(
    '/internal/artifacts/:artifactId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { artifactId } = request.params as { artifactId: string };
        const artifact = await readProjection.getById(artifactId);
        return reply
          .status(artifact ? 200 : 404)
          .send(artifact ?? { error: 'Artifact not found', kind: 'not-found' });
      } catch (error) {
        const response = toInvocationErrorResponse(error);
        return reply.status(response.status).send(response.body);
      }
    },
  );
  app.post(
    '/internal/artifacts/:artifactId/lifecycle',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { artifactId } = request.params as { artifactId: string };
        const body = request.body as {
          state: Parameters<ArtifactWritePort['updateLifecycle']>[1];
          actorId: string;
          note?: string;
        };
        const artifact = await artifacts.updateLifecycle(artifactId, body.state, {
          actorId: body.actorId,
          ...(body.note ? { note: body.note } : {}),
        });
        return reply.status(200).send(artifact);
      } catch (error) {
        const response = toInvocationErrorResponse(error);
        return reply.status(response.status).send(response.body);
      }
    },
  );
  app.post('/internal/artifacts/:artifactId/edit', async (request, reply) => {
    try {
      return reply
        .status(200)
        .send(
          await artifacts.editArtifact(
            (request.params as { artifactId: string }).artifactId,
            (request.body ?? {}) as Record<string, unknown>,
          ),
        );
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.get('/internal/artifacts/:artifactId/history', async (request, reply) => {
    try {
      return reply
        .status(200)
        .send(await readProjection.history((request.params as { artifactId: string }).artifactId));
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.post('/internal/artifacts/:artifactId/review', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as {
        decision?: 'approve' | 'reject';
        actorId?: string;
        note?: string;
      };
      return reply
        .status(200)
        .send(
          await artifacts.review(
            (request.params as { artifactId: string }).artifactId,
            body.decision ?? 'reject',
            body.actorId ?? 'system',
            body.note,
          ),
        );
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.post('/internal/artifacts/activate', async (request, reply) => {
    try {
      return reply
        .status(200)
        .send(await artifacts.activate((request.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.post('/internal/artifacts/:artifactId/deactivate', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { actorId?: string; note?: string };
      return reply
        .status(200)
        .send(
          await artifacts.updateLifecycle(
            (request.params as { artifactId: string }).artifactId,
            'deactivated',
            { actorId: body.actorId ?? 'system', ...(body.note ? { note: body.note } : {}) },
          ),
        );
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
}
