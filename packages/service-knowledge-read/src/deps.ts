import type { KnowledgeEntryRecord } from '@trapmap/backend-core';

export interface KnowledgeReadProjectionStatusSurface {
  surface: string;
  owner: 'knowledge-read' | 'governance-review';
  providedBy: 'knowledge-read' | 'governance-review';
  source:
    | 'temporary-direct-backed-projection'
    | 'temporary-direct-backed-operator-projection'
    | 'derived-projection'
    | 'derived-search-index'
    | 'derived-query-trace'
    | 'governance-read-model';
  authoritativeSource: string;
  consistency: 'strong' | 'eventual';
  freshness: 'current' | 'refresh-pending' | 'degraded';
  fallback: 'none' | 'direct-authoritative-read';
  notes?: string;
  exitCriteria?: string;
}

export interface KnowledgeReadProjectionStatus {
  phase: 'phase-2-boundary-closed';
  source: string;
  consistency: 'strong' | 'eventual';
  freshness: 'current' | 'refresh-pending' | 'degraded';
  fallback: 'none' | 'direct-authoritative-read';
  notes?: string;
  surfaces: KnowledgeReadProjectionStatusSurface[];
}

export interface KnowledgeReadDeps {
  knowledgeProjection: {
    getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
    listMine(params: { userId: string; teamId?: string }): Promise<KnowledgeEntryRecord[]>;
    getStatus(): Promise<KnowledgeReadProjectionStatus>;
  };
  retrievalQuery: {
    search(params: {
      query: string;
      teamId?: string;
      limit?: number;
    }): Promise<{
      results: Array<{
        entryId: string;
        score: number;
        snippet?: string;
        metadata?: Record<string, unknown>;
      }>;
      totalEstimate?: number;
      channel?: string;
      latencyMs?: number;
    }>;
  };
}

export interface KnowledgeReadServiceModule {
  getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
  listMine(userId: string, teamId?: string): Promise<KnowledgeEntryRecord[]>;
  search(params: {
    query: string;
    teamId?: string;
    limit?: number;
  }): Promise<Awaited<ReturnType<KnowledgeReadDeps['retrievalQuery']['search']>>>;
  getProjectionStatus(): Promise<KnowledgeReadProjectionStatus>;
}

export interface KnowledgeReadPortDeps {
  knowledgeRepo: {
    getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
    listByFilter(filter: {
      ownerUserId?: string;
      teamId?: string;
    }): Promise<KnowledgeEntryRecord[]>;
  };
  retrievalQuery: KnowledgeReadDeps['retrievalQuery'];
}

function createProjectionStatus(): KnowledgeReadProjectionStatus {
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
      async getById(entryId: string): Promise<KnowledgeEntryRecord | null> {
        return deps.knowledgeRepo.getById(entryId);
      },
      async listMine(params: {
        userId: string;
        teamId?: string;
      }): Promise<KnowledgeEntryRecord[]> {
        return deps.knowledgeRepo.listByFilter({
          ownerUserId: params.userId,
          ...(params.teamId ? { teamId: params.teamId } : {}),
        });
      },
      async getStatus(): Promise<KnowledgeReadProjectionStatus> {
        return createProjectionStatus();
      },
    },
    retrievalQuery: deps.retrievalQuery,
  };
}

export function createKnowledgeReadServiceModule(
  deps: KnowledgeReadDeps,
): KnowledgeReadServiceModule {
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
