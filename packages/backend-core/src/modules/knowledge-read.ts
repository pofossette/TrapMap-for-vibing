/**
 * Knowledge Read bounded-context module.
 *
 * Owns: retrieval queries, read-model access, entry reads.
 * This module is read-only -- it does not modify domain state.
 */

import type { KnowledgeRepositoryPort } from '../ports/repo-ports.js';
import type { RetrievalQueryPort } from '../ports/retrieval-ports.js';
import type { KnowledgeReadPort } from '../ports/internal-ports.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface KnowledgeReadDeps {
  knowledgeRepo: KnowledgeRepositoryPort;
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
      return deps.knowledgeRepo.getById(entryId);
    },

    async listMine(userId: string, teamId?: string) {
      return deps.knowledgeRepo.listByFilter({
        ownerUserId: userId,
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
  };
}
