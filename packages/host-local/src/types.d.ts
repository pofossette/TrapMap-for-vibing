/**
 * Fastify type augmentation for host-local.
 *
 * Adds the `startTime` property used by request logging middleware.
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
