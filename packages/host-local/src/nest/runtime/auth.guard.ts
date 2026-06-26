import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

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
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
      throw new UnauthorizedException('Invalid authorization scheme');
    }

    // Phase 1: token presence check only.
    // Full session validation will be wired when identity-access joins the Nest host.
    request.authToken = token.trim();
    return true;
  }
}
