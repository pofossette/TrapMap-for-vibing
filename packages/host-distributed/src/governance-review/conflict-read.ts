import {
  InvocationError,
  type GovernanceConflictCandidateSet,
  type GovernanceConflictEntry,
  type GovernanceConflictReadPort,
} from '@trapmap/backend-core';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';

import { toInvocationError } from '../shared/invocation-error.js';

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
        throw toInvocationError(response.body, 'knowledge-write conflict candidate read failed');
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
