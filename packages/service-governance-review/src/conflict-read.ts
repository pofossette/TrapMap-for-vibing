import type { GovernanceConflictEntry, GovernanceConflictReadPort } from '@trapmap/backend-core';
import type { KnowledgeOwnerPort } from '@trapmap/contracts';

function toConflictEntry(entry: {
  id: string;
  shortcut: string;
  detail: string;
}): GovernanceConflictEntry {
  return {
    id: entry.id,
    shortcut: entry.shortcut,
    detail: entry.detail,
    lifecycleState: 'approved',
  };
}

export function createGovernanceConflictReadPort(
  owner: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter'>,
): GovernanceConflictReadPort {
  return {
    async getApprovedConflictCandidates(entryId) {
      const entry = await owner.getById(entryId);
      if (!entry || entry.lifecycleState !== 'approved') return null;

      const { items: approvedEntries } = await owner.listByFilter({
        lifecycleState: 'approved',
      });
      return {
        entry: toConflictEntry(entry),
        candidates: approvedEntries
          .filter((candidate) => candidate.id !== entryId)
          .filter((candidate) => candidate.lifecycleState === 'approved')
          .map((candidate) => toConflictEntry(candidate)),
      };
    },
  };
}
