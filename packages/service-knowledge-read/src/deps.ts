import {
  createKnowledgeReadModule,
  type KnowledgeReadDeps,
  type ReadModelProjectionStatus,
} from '@trapmap/backend-core';

export { type KnowledgeReadDeps } from '@trapmap/backend-core';

export interface KnowledgeReadPortDeps {
  knowledgeRepo: {
    getById: KnowledgeReadDeps['knowledgeProjection']['getById'];
    listByFilter(filter: {
      ownerUserId?: string;
      teamId?: string;
    }): Promise<Awaited<ReturnType<KnowledgeReadDeps['knowledgeProjection']['listMine']>>>;
  };
  retrievalQuery: KnowledgeReadDeps['retrievalQuery'];
}

function createProjectionStatus(): ReadModelProjectionStatus {
  return {
    phase: 'phase-2-boundary-closed',
    source: 'mixed-phase-2-read-side-contract',
    consistency: 'eventual',
    freshness: 'current',
    fallback: 'none',
    notes:
      'Phase 2 closes the read-side boundary by making each surface declare its owner, backing source, consistency, freshness, and direct-read allowance explicitly.',
    surfaces: [
      {
        surface: 'knowledge-entry:getById',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'temporary-direct-backed-projection',
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'direct-authoritative-read',
        notes:
          'Entry lookup is still served through an explicit projection adapter over shared authoritative tables.',
        exitCriteria:
          'Replace direct-backed adapter with derived projection ownership before projection-only read maturity.',
      },
      {
        surface: 'knowledge-entry:listMine',
        owner: 'knowledge-read',
        providedBy: 'knowledge-read',
        source: 'temporary-direct-backed-projection',
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'direct-authoritative-read',
        notes:
          'Owned by knowledge-read as a temporary direct-backed projection for operator and user entry lists.',
        exitCriteria:
          'Move list queries onto derived read projection and remove direct authoritative reads.',
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
        source: 'temporary-direct-backed-operator-projection',
        authoritativeSource:
          'knowledge-write maintenance truth plus governance operator read model',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'direct-authoritative-read',
        notes:
          'Operator-facing maintenance entry views remain temporary direct-backed governance projections in Phase 2.',
        exitCriteria:
          'Converge operator maintenance views onto governance-owned derived projections with no direct reads.',
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
  return {
    knowledgeProjection: {
      async getById(entryId) {
        return deps.knowledgeRepo.getById(entryId);
      },
      async listMine(params) {
        return deps.knowledgeRepo.listByFilter({
          ownerUserId: params.userId,
          ...(params.teamId ? { teamId: params.teamId } : {}),
        });
      },
      async getStatus() {
        return createProjectionStatus();
      },
    },
    retrievalQuery: deps.retrievalQuery,
  };
}

export function createKnowledgeReadServiceModule(deps: KnowledgeReadDeps) {
  return createKnowledgeReadModule(deps);
}
