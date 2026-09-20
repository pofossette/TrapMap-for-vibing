/**
 * Knowledge-read bounded context — application layer.
 *
 * Owns retrieval queries, read-model access and entry reads. This module
 * is read-only — it does not modify domain state.
 */

import type { SkillLookupResponse } from '@trapmap/contracts';
import type { KnowledgeReadPort } from '../../ports/internal-ports.js';
import type { KnowledgeEntryRecord } from '../../ports/repo-ports.js';
import type {
  GraphPlanSearchParams,
  KnowledgeReadProjectionPort,
  RetrievalQueryPort,
} from '../../ports/retrieval-ports.js';

import { KNOWLEDGE_READ_OWNED_CAPABILITIES } from '../domain/index.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface KnowledgeReadDeps {
  knowledgeProjection: KnowledgeReadProjectionPort<KnowledgeEntryRecord>;
  retrievalQuery: RetrievalQueryPort;
  skillLookup(params: {
    text: string;
    teamId?: string;
    maxResults?: number;
  }): Promise<SkillLookupResponse>;
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

    // Params are forwarded wholesale, not rebuilt field by field: `variant`
    // and `latencyEndpoint` are internal routing/attribution fields, and
    // reconstructing the object silently dropped them.
    async search(params) {
      return deps.retrievalQuery.search(params);
    },

    // Only exposed when the host wired the corresponding pipeline; the gateway
    // checks for their presence before registering the v2/v3 surfaces.
    ...(deps.retrievalQuery.searchCapsules
      ? {
          async searchCapsules(params: Parameters<KnowledgeReadPort['search']>[0]) {
            return deps.retrievalQuery.searchCapsules!(params);
          },
        }
      : {}),
    ...(deps.retrievalQuery.searchGraphPlan
      ? {
          async searchGraphPlan(params: GraphPlanSearchParams) {
            return deps.retrievalQuery.searchGraphPlan!(params);
          },
        }
      : {}),

    async skillLookup(params: { text: string; teamId?: string; maxResults?: number }) {
      return deps.skillLookup({
        text: params.text,
        ...(params.teamId !== undefined ? { teamId: params.teamId } : {}),
        ...(params.maxResults !== undefined ? { maxResults: params.maxResults } : {}),
      });
    },

    async getProjectionStatus() {
      return deps.knowledgeProjection.getStatus();
    },

    async rebuildProjection() {
      if (!deps.knowledgeProjection.rebuild) {
        throw new Error('knowledge-read projection rebuild is not configured');
      }
      await deps.knowledgeProjection.rebuild();
      return deps.knowledgeProjection.getStatus();
    },
  };
}
