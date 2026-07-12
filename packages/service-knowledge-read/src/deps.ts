import { type KnowledgeReadDeps, createKnowledgeReadModule } from '@trapmap/backend-core';

import { createKnowledgeEntryProjection } from './entry-projection.js';

export type { KnowledgeReadDeps } from '@trapmap/backend-core';

export interface KnowledgeReadPortDeps {
  knowledgeRepo: {
    listByFilter(
      filter: Record<string, never>,
    ): Promise<Awaited<ReturnType<KnowledgeReadDeps['knowledgeProjection']['listMine']>>>;
  };
  retrievalQuery: KnowledgeReadDeps['retrievalQuery'];
}

async function createProjectionStatus(
  entryProjection: ReturnType<typeof createKnowledgeEntryProjection>,
) {
  const entryStatus = await entryProjection.getStatus();
  return {
    phase: 'phase-2-boundary-closed',
    source: entryStatus.source,
    consistency: 'eventual',
    freshness: entryStatus.freshness,
    fallback: entryStatus.fallback,
    ...(entryStatus.lastRefreshedAt ? { lastRefreshedAt: entryStatus.lastRefreshedAt } : {}),
    ...(entryStatus.lagMs !== undefined ? { lagMs: entryStatus.lagMs } : {}),
    refreshTrigger: entryStatus.refreshTrigger,
    notes:
      'Phase 2 closes the read-side boundary by making each surface declare its owner, backing source, consistency, freshness, and fallback explicitly.',
    surfaces: [
      {
        surface: 'knowledge-entry:getById',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'temporary-direct-backed-projection',
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'eventual',
        freshness: entryStatus.freshness,
        fallback: 'direct-authoritative-read',
        notes:
          'Entry lookup is served from the knowledge-read owned temporary direct-backed snapshot.',
        exitCriteria:
          'replace the direct-backed rebuild with an outbox-driven persisted projection.',
      },
      {
        surface: 'knowledge-entry:listMine',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'temporary-direct-backed-projection',
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'eventual',
        freshness: entryStatus.freshness,
        fallback: 'direct-authoritative-read',
        notes:
          'List queries are served from the knowledge-read owned temporary direct-backed snapshot.',
        exitCriteria:
          'replace the direct-backed rebuild with an outbox-driven persisted projection.',
      },
      {
        surface: 'retrieval-search',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'derived-search-index',
        authoritativeSource: 'knowledge-write lifecycle events and retrieval indexing artifacts',
        consistency: 'eventual',
        freshness: 'current',
        fallback: 'none',
        notes:
          'Retrieval queries are served from derived index/search state, not route-local direct SQL assembly.',
      },
      {
        surface: 'retrieval-query-trace',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'derived-query-trace',
        authoritativeSource: 'knowledge-read query trace and badcase capture records',
        consistency: 'eventual',
        freshness: 'current',
        fallback: 'none',
        notes: 'Trace and analytics remain read-side derived state owned by knowledge-read.',
      },
      {
        surface: 'retrieval-cache-metadata',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'derived-projection',
        authoritativeSource: 'knowledge-read cache metadata and projection cache state',
        consistency: 'eventual',
        freshness: 'current',
        fallback: 'none',
        notes:
          'Cache metadata stays on derived read-side state and must not fall back to direct authoritative reads.',
      },
      {
        surface: 'review-queue',
        owner: 'governance-review',
        providedBy: 'governance-review',
        source: 'governance-read-model',
        authoritativeSource: 'governance-review queue and workbench tables',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'none',
        notes: 'Review queue stays outside knowledge-read and is served by governance-review.',
      },
      {
        surface: 'maintenance-entries',
        owner: 'governance-review',
        providedBy: 'governance-review',
        source: 'derived-projection',
        authoritativeSource: 'governance-review derived maintenance read model',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'none',
        notes:
          'Operator-facing maintenance entry views are served from a governance-owned derived projection.',
      },
      {
        surface: 'decay-entries-search',
        owner: 'governance-review',
        providedBy: 'governance-review',
        source: 'governance-read-model',
        authoritativeSource: 'governance-review decay workbench and operator queues',
        consistency: 'eventual',
        freshness: 'current',
        fallback: 'none',
        notes:
          'Decay workbench search remains a governance-review concern unless promoted into retrieval-facing search.',
      },
    ],
  };
}

export function createKnowledgeReadDeps(deps: KnowledgeReadPortDeps): KnowledgeReadDeps {
  const entryProjection = createKnowledgeEntryProjection({ knowledgeRepo: deps.knowledgeRepo });

  return {
    knowledgeProjection: {
      async getById(entryId) {
        return entryProjection.getById(entryId);
      },
      async listMine(params) {
        return entryProjection.listMine(params);
      },
      async getStatus() {
        return createProjectionStatus(entryProjection);
      },
      rebuild: () => entryProjection.rebuild(),
    },
    retrievalQuery: deps.retrievalQuery,
  };
}

export function createKnowledgeReadServiceModule(deps: KnowledgeReadDeps) {
  return createKnowledgeReadModule(deps);
}
