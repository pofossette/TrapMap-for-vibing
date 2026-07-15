import { InvocationError, toInvocationErrorResponse } from '@trapmap/backend-core';
import type { ArtifactReadProjection } from '@trapmap/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ArtifactWritePort } from './artifact-ports.js';

function trustedActor(
  request: FastifyRequest,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const actorId = request.headers['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || actorId.length === 0) {
    throw InvocationError.unauthorized('Missing trusted actor identity');
  }
  if (typeof body.actorId === 'string' && body.actorId !== actorId) {
    throw InvocationError.forbidden('Body actor does not match trusted actor identity');
  }
  const { actorId: _bodyActorId, ...input } = body;
  return { ...input, actorId };
}

export function registerArtifactRoutes(
  app: FastifyInstance,
  artifacts: ArtifactWritePort,
  readProjection: ArtifactReadProjection,
): void {
  app.post('/internal/artifacts/import', async (request, reply) => {
    try {
      const body = trustedActor(request, (request.body ?? {}) as Record<string, unknown>);
      return reply.status(201).send(await artifacts.importArtifact(body));
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
        const body = trustedActor(request, (request.body ?? {}) as Record<string, unknown>) as {
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
      const body = trustedActor(request, (request.body ?? {}) as Record<string, unknown>);
      return reply
        .status(200)
        .send(
          await artifacts.editArtifact((request.params as { artifactId: string }).artifactId, body),
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
      const body = trustedActor(request, (request.body ?? {}) as Record<string, unknown>) as {
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
      const body = trustedActor(request, (request.body ?? {}) as Record<string, unknown>);
      return reply.status(200).send(await artifacts.activate(body));
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
  app.post('/internal/artifacts/:artifactId/deactivate', async (request, reply) => {
    try {
      const body = trustedActor(request, (request.body ?? {}) as Record<string, unknown>) as {
        actorId: string;
        note?: string;
      };
      return reply
        .status(200)
        .send(
          await artifacts.updateLifecycle(
            (request.params as { artifactId: string }).artifactId,
            'deactivated',
            { actorId: body.actorId, ...(body.note ? { note: body.note } : {}) },
          ),
        );
    } catch (error) {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    }
  });
}
