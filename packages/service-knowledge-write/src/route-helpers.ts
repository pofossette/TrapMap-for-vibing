import { InvocationError } from '@trapmap/backend-core';

export function trustedActor<T extends Record<string, unknown>>(
  headers: Record<string, unknown>,
  body: T,
): Omit<T, 'actorId'> & { actorId: string } {
  const actorId = headers['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || actorId.length === 0) {
    throw InvocationError.unauthorized('Missing trusted actor identity');
  }
  if (typeof body.actorId === 'string' && body.actorId !== actorId) {
    throw InvocationError.forbidden('Body actor does not match trusted actor identity');
  }
  const { actorId: _bodyActorId, ...input } = body;
  return { ...input, actorId };
}
