import type { RetrievalQueryPort } from '@trapmap/backend-core';
import { type SkillLookupArtifactMeta, toSkillLookupMatches } from '@trapmap/backend-core';
import type {
  ArtifactReadProjection,
  ConflictRelation,
  KnowledgeEntry,
  KnowledgeOwnerPort,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  RetrievalGovernanceProjection,
  RetrievalQuery,
} from '@trapmap/contracts';
import {
  type EmbeddingCacheRecord,
  knowledgeMetadataSchema,
  lifecycleStateSchema,
  type SkillLookupResponse,
  skillLookupResponseSchema,
} from '@trapmap/contracts';
import { nowIso } from '@trapmap/lib';
import type {
  KnowledgeReadAiServices,
  KnowledgeReadGraphQueryBackend,
  KnowledgeReadGraphQueryRuntimeState,
  KnowledgeReadRetrievalInfra,
  KnowledgeReadStoreSeam,
  ResolvedAuthContext,
  SkillShareerRepos,
} from './context.js';
import { createDefaultKnowledgeReadRetrievalInfra } from './retrieval-infra-default.js';
import { keywordChannel } from './retrieval-keyword.js';
import {
  ChannelRegistry,
  type RetrievalStrategy,
  StrategyRegistry,
} from './retrieval-orchestration.js';
import {
  graphAssistedHybridRecall,
  hybridRecall,
  semanticRecall,
} from './retrieval-recall-coordinator.js';
import { semanticChannel } from './retrieval-semantic.js';
import { searchKnowledge } from './search-knowledge.js';
import type { FeedbackQueueRecord } from './store.js';

type SearchKnowledgeServices = Parameters<typeof searchKnowledge>[0];
type SearchKnowledgeAuth = Parameters<typeof searchKnowledge>[1];

export interface KnowledgeReadRetrievalQueryOptions {
  services: SearchKnowledgeServices;
  resolveAuthContext(params: { teamId?: string }): SearchKnowledgeAuth;
  mode?: RetrievalQuery['mode'];
}

export type KnowledgeReadSkillLookupQueryOptions = KnowledgeReadRetrievalQueryOptions;

export interface KnowledgeReadOwnerRetrievalServicesOptions {
  config: SearchKnowledgeServices['config'];
  knowledge: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter' | 'updateEmbeddingCache'>;
  artifact: Pick<ArtifactReadProjection, 'listByFilter' | 'listForRetrieval'>;
  governance: RetrievalGovernanceProjection<FeedbackQueueRecord, ConflictRelation>;
  strategyRegistry: SearchKnowledgeServices['strategyRegistry'];
  channelRegistry: SearchKnowledgeServices['channelRegistry'];
  ai: KnowledgeReadAiServices;
  store: KnowledgeReadStoreSeam;
  graphQuery: KnowledgeReadGraphQueryRuntimeState;
  graphQueryBackend?: KnowledgeReadGraphQueryBackend;
  retrievalInfra?: KnowledgeReadRetrievalInfra;
  /** D8 intent-recognition judgment port (rule default when absent). */
  intentRecognition?: SearchKnowledgeServices['intentRecognition'];
  /** D8 channel-merge judgment port (rule default when absent). */
  channelMerge?: SearchKnowledgeServices['channelMerge'];
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string')
    ? value
    : undefined;

/**
 * Adapt the owner port to the retrieval pipeline's repository seam.
 *
 * `KnowledgeOwnerPort.listByFilter` returns a `{ items, total }` envelope
 * while the pipeline consumes bare arrays; the previous `as unknown as`
 * bridge hid that mismatch until live search hit
 * `knowledgeEntries.flatMap is not a function`. Field mapping is explicit
 * (zod-narrowed, no assertions) so unknown filter keys fail loud at the
 * contract schema instead of silently changing query semantics.
 */
function adaptKnowledgeOwner(
  owner: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter' | 'updateEmbeddingCache'>,
): SkillShareerRepos['knowledge'] {
  return {
    getById: (entryId) => owner.getById(entryId),
    updateEmbeddingCache: (entryId, cache) => owner.updateEmbeddingCache(entryId, cache),
    listByFilter: async (filter) => {
      const lifecycleState = lifecycleStateSchema.safeParse(filter.lifecycleState);
      const entryIds = asStringArray(filter.entryIds);
      const teamId = asString(filter.teamId);
      const ownerUserId = asString(filter.ownerUserId);
      const labels = asStringArray(filter.labels);
      const requiredLevelMax =
        typeof filter.requiredLevelMax === 'number' ? filter.requiredLevelMax : undefined;
      const operation = asString(filter.operation);
      const result = await owner.listByFilter({
        ...(entryIds ? { entryIds } : {}),
        ...(lifecycleState.success ? { lifecycleState: lifecycleState.data } : {}),
        ...(teamId ? { teamId } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(labels ? { labels } : {}),
        ...(requiredLevelMax !== undefined ? { requiredLevelMax } : {}),
        ...(operation ? { operation } : {}),
      });
      // The owner port resolves a `{ items, total }` envelope; in-memory
      // doubles used in tests resolve a bare array. Accept both so the seam
      // stays honest for every producer without type bridges.
      const items = Array.isArray(result) ? result : result.items;
      return items.map(entryToRetrievalRecord);
    },
  };
}

/**
 * Runtime shape of owner-projection list items.
 *
 * `toKnowledgeEntryProjection` spreads raw PG rows under the contract
 * `KnowledgeEntry` type, so at runtime the items carry snake_case columns
 * (`owner_user_id`, `created_at`, `embedding_cache`, …) and lack the
 * composed objects the contract claims (`owner`, `latestRevision`,
 * `history`). This type declares exactly that uncertainty — every access
 * below is narrowed, never asserted.
 */
type RuntimeOwnerItem = Omit<
  KnowledgeEntry,
  'owner' | 'latestRevision' | 'history' | 'createdAt' | 'updatedAt'
> & {
  owner?: unknown;
  ownerUserId?: unknown;
  owner_user_id?: unknown;
  latestRevision?: unknown;
  history?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  team_id?: unknown;
  embedding_cache?: unknown;
  embeddingCache?: unknown;
};

const readField = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null) return undefined;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key) return entryValue;
  }
  return undefined;
};

const readId = (value: unknown): string | undefined => {
  const id = readField(value, 'id');
  return typeof id === 'string' ? id : undefined;
};

const readTimestamp = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  // Columns are NOT NULL timestamptz, so a missing value means a driver or
  // query surprise — fail open with now rather than crashing the search.
  return typeof value === 'string' ? value : nowIso();
};

const isEmbeddingCache = (value: unknown): value is EmbeddingCacheRecord => {
  const textHash = readField(value, 'textHash');
  const vector = readField(value, 'vector');
  const createdAt = readField(value, 'createdAt');
  const revision = readField(value, 'revision');
  return (
    typeof textHash === 'string' &&
    Array.isArray(vector) &&
    vector.every((entry: unknown): entry is number => typeof entry === 'number') &&
    typeof createdAt === 'string' &&
    typeof revision === 'number'
  );
};

/**
 * Project an owner entry into the retrieval pipeline's record shape.
 *
 * Presentation-only (mirrors `artifactToRetrievalEntry`): no rows are
 * written and no entry state is mutated. Row-backed columns win over
 * composed contract claims where they disagree (`ownerUserId`,
 * timestamps, caches); revision/history/metadata fall back to documented
 * projection defaults because list queries do not join the revision
 * tables. Unknown index state stays null so recall regenerates vectors
 * fail-open instead of trusting unvalidated blobs.
 */
export function entryToRetrievalRecord(entry: KnowledgeEntry): KnowledgeRecord {
  const item: RuntimeOwnerItem = entry;
  const ownerUserId = readId(item.owner) ?? readOwnerUserId(item);
  if (!ownerUserId) {
    throw new Error('owner projection row is missing owner identity');
  }
  const createdAt = readTimestamp(item.createdAt ?? item.created_at);
  const updatedAt = readTimestamp(item.updatedAt ?? item.updated_at);
  const teamId = typeof item.teamId === 'string' ? item.teamId : readTeamId(item);
  const revision = toProjectionRevision(item, ownerUserId, createdAt);
  const embeddingCache = isEmbeddingCache(item.embedding_cache)
    ? item.embedding_cache
    : isEmbeddingCache(item.embeddingCache)
      ? item.embeddingCache
      : null;
  const metadata = knowledgeMetadataSchema.safeParse(item.metadata);
  return {
    id: entry.id,
    teamId,
    scope: entry.scope,
    labels: entry.labels,
    shortcut: entry.shortcut,
    detail: entry.detail,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    ownerUserId,
    latestRevision: revision,
    history: [revision],
    metadata: metadata.success
      ? metadata.data
      : {
          scopeLabel: entry.scope === 'global' ? 'global-constraint' : 'project-knowledge',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: createdAt,
          latestReviewedAt: null,
          latestDecision: null,
        },
    latestSubmissionId: entry.latestSubmission?.id ?? null,
    submissionHistory: [],
    agentReview: entry.agentReview,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache,
    indexState: null,
    boundary: entry.boundary,
    decayMeta: null,
    evidenceMeta: entry.evidenceMeta,
    maintenanceMeta: entry.maintenanceMeta
      ? {
          maintainerUserId: entry.maintenanceMeta.maintainer?.id ?? null,
          maintainerHandle: entry.maintenanceMeta.maintainer?.handle ?? null,
          maintainerLevel: entry.maintenanceMeta.maintainer?.securityLevel ?? null,
          reviewBy: entry.maintenanceMeta.reviewBy,
        }
      : null,
    ...(entry.remediation !== undefined ? { remediation: entry.remediation } : {}),
    createdAt,
    updatedAt,
  };
}

function readOwnerUserId(item: RuntimeOwnerItem): string | undefined {
  if (typeof item.ownerUserId === 'string') return item.ownerUserId;
  if (typeof item.owner_user_id === 'string') return item.owner_user_id;
  return undefined;
}

function readTeamId(item: RuntimeOwnerItem): string | null {
  if (typeof item.team_id === 'string') return item.team_id;
  return null;
}

function toProjectionRevision(
  item: RuntimeOwnerItem,
  ownerUserId: string,
  submittedAt: string,
): KnowledgeRevisionRecord {
  return {
    revision: 1,
    submittedAt,
    submittedByUserId: ownerUserId,
    shortcut: item.shortcut,
    detail: item.detail,
    labels: item.labels,
    reviewNotes: [],
  };
}

export function createKnowledgeReadOwnerRetrievalServices(
  options: KnowledgeReadOwnerRetrievalServicesOptions,
): SearchKnowledgeServices {
  const repos: SkillShareerRepos = {
    knowledge: adaptKnowledgeOwner(options.knowledge),
    artifact: options.artifact as unknown as SkillShareerRepos['artifact'], // lib type gap: the owner
    // port returns contracts artifact records while the retrieval pipeline consumes
    // the internal SkillArtifactRecord shape — same runtime rows
    governanceRetrievalProjection: options.governance,
    usageAnalytics: null,
    graphIndex: null,
  };

  return {
    config: options.config,
    repos,
    strategyRegistry: options.strategyRegistry,
    channelRegistry: options.channelRegistry,
    ai: options.ai,
    store: options.store,
    graphQuery: options.graphQuery,
    ...(options.graphQueryBackend ? { graphQueryBackend: options.graphQueryBackend } : {}),
    ...(options.retrievalInfra ? { retrievalInfra: options.retrievalInfra } : {}),
    ...(options.intentRecognition ? { intentRecognition: options.intentRecognition } : {}),
    ...(options.channelMerge ? { channelMerge: options.channelMerge } : {}),
  };
}

export function createKnowledgeReadRetrievalInfra(): KnowledgeReadRetrievalInfra {
  return createDefaultKnowledgeReadRetrievalInfra();
}

export function createKnowledgeReadChannelRegistry(): ChannelRegistry {
  const registry = new ChannelRegistry();
  registry.register(semanticChannel);
  registry.register(keywordChannel);
  return registry;
}

export function createKnowledgeReadStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();
  const semanticStrategy: RetrievalStrategy = {
    version: 'semantic',
    async execute(query, _channels, eligibleEntries, services, auth) {
      return semanticRecall(query.seed, eligibleEntries, query, services, auth);
    },
  };
  const hybridStrategy: RetrievalStrategy = {
    version: 'hybrid',
    async execute(query, _channels, eligibleEntries, services, auth) {
      return hybridRecall(query.seed, eligibleEntries, query, services, auth);
    },
  };
  const graphAssistedStrategy: RetrievalStrategy = {
    version: 'graph-assisted',
    async execute(query, _channels, eligibleEntries, services) {
      return graphAssistedHybridRecall(query.seed, eligibleEntries, query, services);
    },
  };
  registry.register(semanticStrategy);
  registry.register(hybridStrategy);
  registry.register(graphAssistedStrategy);
  return registry;
}

export function createKnowledgeReadRetrievalQuery(
  options: KnowledgeReadRetrievalQueryOptions,
): RetrievalQueryPort {
  return {
    async search(params) {
      const auth = options.resolveAuthContext(params) as ResolvedAuthContext;
      // Return the full contract response verbatim: gateway v1/v3 surfaces
      // forward this body to CLI consumers that parse `RetrievalResponse`.
      return searchKnowledge(options.services, auth, {
        seed: params.query,
        filters: {
          labels: [],
          scopes: ['global', 'project'],
          ...(params.teamId ? { teamId: params.teamId } : {}),
        },
        includeRefinement: false,
        includeSummary: false,
        mode: options.mode ?? 'hybrid',
        maxResults: params.limit ?? 10,
      });
    },
  };
}

export function createKnowledgeReadSkillLookupQuery(
  options: KnowledgeReadSkillLookupQueryOptions,
): (params: {
  text: string;
  teamId?: string;
  maxResults?: number;
}) => Promise<SkillLookupResponse> {
  return async (params) => {
    const auth = options.resolveAuthContext(params) as ResolvedAuthContext;
    const maxResults = params.maxResults ?? 10;
    const artifactRepository = options.services.repos.artifact;
    if (!artifactRepository?.listForRetrieval) {
      throw new Error('skill lookup requires the knowledge-read artifact retrieval projection');
    }
    const [result, artifacts] = await Promise.all([
      searchKnowledge(options.services, auth, {
        seed: params.text,
        filters: {
          labels: [],
          scopes: ['global', 'project'],
          ...(params.teamId ? { teamId: params.teamId } : {}),
        },
        includeRefinement: false,
        includeSummary: false,
        mode: options.mode ?? 'hybrid',
        maxResults: 50,
      }),
      artifactRepository.listForRetrieval({}),
    ]);

    const matchedIds = new Set(
      [...result.globalConstraints, ...result.projectKnowledge].map((match) => match.entryId),
    );
    const artifactMetaByEntryId = new Map<string, SkillLookupArtifactMeta>(
      artifacts
        .filter((artifact) => matchedIds.has(artifact.id))
        .map((artifact) => [
          artifact.id,
          {
            slug: artifact.slug,
            sourceKind: artifact.metadata.sourceKind,
            title: artifact.title,
          },
        ]),
    );
    const matches = toSkillLookupMatches(
      [...result.globalConstraints, ...result.projectKnowledge],
      artifactMetaByEntryId,
    ).slice(0, maxResults);

    return skillLookupResponseSchema.parse({
      ...(result.queryId ? { queryId: result.queryId } : {}),
      matches,
    });
  };
}
