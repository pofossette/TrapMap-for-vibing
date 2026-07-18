import {
  InvocationError,
  type GovernanceConflictCandidateSet,
  type GovernanceConflictEntry,
  type GovernanceConflictReadPort,
} from '@trapmap/backend-core';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';

function mapRemoteError(body: unknown, fallback: string): InvocationError {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = typeof payload.error === 'string' ? payload.error : fallback;
  switch (payload.kind) {
    case 'validation':
      return InvocationError.validation(message, body);
    case 'unauthorized':
      return InvocationError.unauthorized(message, body);
    case 'forbidden':
      return InvocationError.forbidden(message, body);
    case 'not-found':
      return InvocationError.notFound(message, body);
    case 'conflict':
      return InvocationError.conflict(message, body);
    case 'timeout':
      return InvocationError.timeout(message, body);
    case 'unavailable':
      return InvocationError.unavailable(message, body);
    default:
      return InvocationError.internal(message, body);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function parseEntry(value: unknown, fallback: string): GovernanceConflictEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.shortcut !== 'string' ||
    typeof value.detail !== 'string' ||
    value.lifecycleState !== 'approved'
  ) {
    throw InvocationError.internal(fallback, value);
  }
  return {
    id: value.id,
    shortcut: value.shortcut,
    detail: value.detail,
    lifecycleState: 'approved',
  };
}

export function createDistributedGovernanceConflictReadPort(
  clients: Pick<InternalServiceClients, 'knowledgeWrite'>,
): GovernanceConflictReadPort {
  return {
    async getApprovedConflictCandidates(entryId): Promise<GovernanceConflictCandidateSet | null> {
      const response = await clients.knowledgeWrite.getConflictCandidates(entryId);
      if (response.status < 200 || response.status >= 300) {
        throw mapRemoteError(response.body, 'knowledge-write conflict candidate read failed');
      }
      if (response.body === null) return null;
      if (!isRecord(response.body) || !Array.isArray(response.body.candidates)) {
        throw InvocationError.internal(
          'knowledge-write returned an invalid conflict candidate projection',
          response.body,
        );
      }
      return {
        entry: parseEntry(
          response.body.entry,
          'knowledge-write returned an invalid conflict candidate entry',
        ),
        candidates: response.body.candidates.map((candidate) =>
          parseEntry(candidate, 'knowledge-write returned an invalid conflict candidate'),
        ),
      };
    },
  };
}
