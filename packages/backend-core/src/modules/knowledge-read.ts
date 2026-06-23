/**
 * Knowledge Read bounded-context module.
 *
 * Owns: retrieval queries, read-model access, entry reads.
 * This module is read-only -- it does not modify domain state.
 */

import type { KnowledgeReadPort } from '../ports/internal-ports.js';
import type { KnowledgeEntryRecord } from '../ports/repo-ports.js';
import type { KnowledgeReadProjectionPort, RetrievalQueryPort } from '../ports/retrieval-ports.js';

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
  owns: ['knowledge-queries', 'retrieval-search', 'read-model'] as const,
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
