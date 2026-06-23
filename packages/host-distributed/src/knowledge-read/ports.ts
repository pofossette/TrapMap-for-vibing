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
        phase: 'phase-2-boundary-closed' as const,
        source: 'mixed-phase-2-read-side-contract',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Phase 2 closes the read-side boundary by making each surface declare its owner, backing source, consistency, freshness, and direct-read allowance explicitly.',
        surfaces: [
          {
            surface: 'knowledge-entry:getById',
            owner: 'knowledge-read' as const,
            providedBy: 'knowledge-read' as const,
            source: 'temporary-direct-backed-projection' as const,
            authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
            consistency: 'strong' as const,
            freshness: 'current' as const,
            fallback: 'direct-authoritative-read' as const,
            notes:
              'Entry lookup is still served through an explicit projection adapter over shared authoritative tables.',
            exitCriteria:
              'Replace direct-backed adapter with derived projection ownership before projection-only read maturity.',
          },
          {
            surface: 'knowledge-entry:listMine',
            owner: 'knowledge-read' as const,
            providedBy: 'knowledge-read' as const,
            source: 'temporary-direct-backed-projection' as const,
            authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
            consistency: 'strong' as const,
            freshness: 'current' as const,
            fallback: 'direct-authoritative-read' as const,
            notes:
              'Owned by knowledge-read as a temporary direct-backed projection for operator and user entry lists.',
            exitCriteria:
              'Move list queries onto derived read projection and remove direct authoritative reads.',
          },
          {
            surface: 'retrieval-search',
            owner: 'knowledge-read' as const,
            providedBy: 'knowledge-read' as const,
            source: 'derived-search-index' as const,
            authoritativeSource:
              'knowledge-write lifecycle events and retrieval indexing artifacts',
            consistency: 'eventual' as const,
            freshness: 'current' as const,
            fallback: 'none' as const,
            notes:
              'Retrieval queries are served from derived index/search state, not route-local direct SQL assembly.',
          },
          {
            surface: 'retrieval-query-trace',
            owner: 'knowledge-read' as const,
            providedBy: 'knowledge-read' as const,
            source: 'derived-query-trace' as const,
            authoritativeSource: 'knowledge-read query trace and badcase capture records',
            consistency: 'eventual' as const,
            freshness: 'current' as const,
            fallback: 'none' as const,
            notes: 'Trace and analytics remain read-side derived state owned by knowledge-read.',
          },
          {
            surface: 'review-queue',
            owner: 'governance-review' as const,
            providedBy: 'governance-review' as const,
            source: 'governance-read-model' as const,
            authoritativeSource: 'governance-review queue and workbench tables',
            consistency: 'strong' as const,
            freshness: 'current' as const,
            fallback: 'none' as const,
            notes: 'Review queue stays outside knowledge-read and is served by governance-review.',
          },
          {
            surface: 'maintenance-entries',
            owner: 'governance-review' as const,
            providedBy: 'governance-review' as const,
            source: 'temporary-direct-backed-operator-projection' as const,
            authoritativeSource:
              'knowledge-write maintenance truth plus governance operator read model',
            consistency: 'strong' as const,
            freshness: 'current' as const,
            fallback: 'direct-authoritative-read' as const,
            notes:
              'Operator-facing maintenance entry views remain temporary direct-backed governance projections in Phase 2.',
            exitCriteria:
              'Converge operator maintenance views onto governance-owned derived projections with no direct reads.',
          },
          {
            surface: 'decay-entries-search',
            owner: 'governance-review' as const,
            providedBy: 'governance-review' as const,
            source: 'governance-read-model' as const,
            authoritativeSource: 'governance-review decay workbench and operator queues',
            consistency: 'eventual' as const,
            freshness: 'current' as const,
            fallback: 'none' as const,
            notes:
              'Decay workbench search remains a governance-review concern unless promoted into retrieval-facing search.',
          },
        ],
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
