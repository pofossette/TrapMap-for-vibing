import { InvocationError, toInvocationErrorResponse } from '@trapmap/backend-core';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function trustedActor<T extends Record<string, unknown>>(
  request: FastifyRequest,
  body: T,
): Omit<T, 'actorId'> & { actorId: string } {
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

export function sendInvocationError(reply: FastifyReply, error: unknown): FastifyReply {
  const response = toInvocationErrorResponse(error);
  return reply.status(response.status).send(response.body);
}

export async function sendInvocation<T>(
  reply: FastifyReply,
  status: number,
  operation: () => Promise<T>,
): Promise<FastifyReply> {
  try {
    return reply.status(status).send(await operation());
  } catch (error) {
    return sendInvocationError(reply, error);
  }
}
