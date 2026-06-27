import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { resolveAuthContext } from '@trapmap/server/lib/session.js';

import { HOST_LOCAL_RUNTIME_TOKEN } from './host-runtime.js';
import type { HostLocalRuntime } from './host-runtime.js';

/**
 * Auth guard for the Nest host.
 *
 * Phase 1 scope:
 * - Checks for a bearer token in the Authorization header.
 * - 401 is a transport/gateway concern, NOT part of InvocationErrorKind.
 * - Full session validation is deferred (identity-access is not in pilot).
 *
 * The guard attaches to routes that require authentication.
 * Routes that are public (e.g., health checks) do not use this guard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(HOST_LOCAL_RUNTIME_TOKEN)
    private readonly runtime?: HostLocalRuntime,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
      throw new UnauthorizedException('Invalid authorization scheme');
    }

    request.authToken = token.trim();
    if (this.runtime) {
      request.authContext = await resolveAuthContext(this.runtime.services, request as never);
    }
    return true;
  }
}
