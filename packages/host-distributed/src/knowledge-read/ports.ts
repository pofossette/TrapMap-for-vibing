/**
 * Knowledge-read service dependency wiring.
 *
 * Maps the shared ServicePortImplementations to the KnowledgeReadDeps
 * shape expected by the backend-core knowledge-read module.
 */

import type { KnowledgeEntryRecord, KnowledgeReadDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';

function createKnowledgeProjection(ports: ServicePortImplementations) {
  return {
    async getById(entryId: string): Promise<KnowledgeEntryRecord | null> {
      return ports.repos.knowledge.getById(entryId);
    },
    async listMine(params: { userId: string; teamId?: string }): Promise<KnowledgeEntryRecord[]> {
      return ports.repos.knowledge.listByFilter({
        ownerUserId: params.userId,
        ...(params.teamId ? { teamId: params.teamId } : {}),
      });
    },
    async getStatus() {
      return {
        source: 'shared-postgresql-authoritative-read-model',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'direct-authoritative-read' as const,
        notes:
          'Phase 1 still reads the shared authoritative PostgreSQL model through an explicit projection adapter; no separate projection store exists yet.',
      };
    },
  };
}

export function createKnowledgeReadDeps(ports: ServicePortImplementations): KnowledgeReadDeps {
  return {
    knowledgeProjection: createKnowledgeProjection(ports),
    retrievalQuery: ports.retrievalQuery,
  };
}
