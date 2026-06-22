import type { FastifyReply } from 'fastify';

export function sendCompatibilityShellUnsupported(
  reply: FastifyReply,
  capability: string,
  owningService: string,
) {
  return reply.status(501).send({
    code: 'capability_unsupported',
    message: `This server route is a compatibility shell and no longer performs authoritative writes. Use ${owningService} for ${capability}.`,
  });
}
