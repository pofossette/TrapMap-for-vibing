/**
 * Knowledge-read bounded context — application layer.
 *
 * Owns retrieval queries, read-model access and entry reads. This module
 * is read-only — it does not modify domain state.
 */

import type { KnowledgeReadPort } from '@trapmap/backend-core/ports/internal-ports.js';
import type { KnowledgeEntryRecord } from '@trapmap/backend-core/ports/repo-ports.js';
import type {
  KnowledgeReadProjectionPort,
  RetrievalQueryPort,
} from '@trapmap/backend-core/ports/retrieval-ports.js';

import { KNOWLEDGE_READ_OWNED_CAPABILITIES } from '@trapmap/backend-core/knowledge-read/domain/index.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface KnowledgeReadDeps {
  knowledgeProjection: KnowledgeReadProjectionPort<KnowledgeEntryRecord>;
  retrievalQuery: RetrievalQueryPort;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const KNOWLEDGE_READ_MODULE = {
  name: 'knowledge-read' as const,
  owns: KNOWLEDGE_READ_OWNED_CAPABILITIES,
  dependsOn: [] as const,
} as const;

/**
 * Create a KnowledgeReadPort backed by the given dependencies.
 */
export function createKnowledgeReadModule(deps: KnowledgeReadDeps): KnowledgeReadPort {
  return {
    async getById(entryId: string) {
      return deps.knowledgeProjection.getById(entryId);
    },

    async listMine(userId: string, teamId?: string) {
      return deps.knowledgeProjection.listMine({
        userId,
        ...(teamId ? { teamId } : {}),
      });
    },

    async search(params: { query: string; teamId?: string; limit?: number }) {
      return deps.retrievalQuery.search({
        query: params.query,
        ...(params.teamId !== undefined ? { teamId: params.teamId } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      });
    },

    async getProjectionStatus() {
      return deps.knowledgeProjection.getStatus();
    },
  };
}
