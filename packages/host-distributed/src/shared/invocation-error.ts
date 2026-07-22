import { InvocationError, type InvocationErrorKind } from '@trapmap/backend-core';

export function toInvocationError(body: unknown, fallback: string): InvocationError {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = typeof payload.error === 'string' ? payload.error : fallback;
  const factoryByKind: Record<InvocationErrorKind, typeof InvocationError.internal> = {
    validation: InvocationError.validation,
    unauthorized: InvocationError.unauthorized,
    'not-found': InvocationError.notFound,
    conflict: InvocationError.conflict,
    forbidden: InvocationError.forbidden,
    timeout: InvocationError.timeout,
    unavailable: InvocationError.unavailable,
    internal: InvocationError.internal,
  };
  const factory = factoryByKind[payload.kind as InvocationErrorKind] ?? InvocationError.internal;
  return factory(message, body);
}
