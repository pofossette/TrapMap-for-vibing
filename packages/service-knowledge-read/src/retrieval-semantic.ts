import {
  buildEmbeddingText,
  computeScore,
  cosineSimilarity,
  versionMatchMultiplier,
} from '@trapmap/backend-core';
import type { RetrievalQuery } from '@trapmap/contracts';

import type { SkillShareerServices } from './context.js';
import { getDefaultRetrievalInfra, getRetrievalInfra } from './retrieval-infra.js';
import type { KnowledgeReadRecallChannel } from './retrieval-orchestration.js';
import { artifactVersionOf } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

export { buildEmbeddingText } from '@trapmap/backend-core';

export async function getQueryEmbedding(
  services: SkillShareerServices,
  queryText: string,
): Promise<number[]> {
  const infra = getRetrievalInfra(services);
  const cached = infra.embeddings.getCachedQuery(queryText);
  if (cached) {
    return cached;
  }

  const vector = await infra.embeddings.generate(queryText);
  infra.embeddings.setCachedQuery(queryText, vector);
  return vector;
}

interface BatchEmbeddingResult {
  vector: number[];
  fromCache: boolean;
}

interface BatchCacheStats {
  totalEntries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

interface OptimizedSemanticRecallResult {
  scoredEntries: Array<{ entry: KnowledgeRecord; score: number }>;
  cacheStats: BatchCacheStats;
}

function getCachedEmbedding(
  services: SkillShareerServices,
  entry: KnowledgeRecord,
): number[] | null {
  const infra = getRetrievalInfra(services);
  const text = buildEmbeddingText(entry);
  const textHash = infra.embeddings.hashText(text);

  if (
    entry.indexState?.vector?.status === 'synced' &&
    entry.indexState.vector.revision === entry.history.length &&
    entry.indexState.vector.contentHash === textHash
  ) {
    if (entry.embeddingCache?.vector) {
      return entry.embeddingCache.vector;
    }
  }

  if (
    entry.embeddingCache &&
    entry.embeddingCache.revision === entry.history.length &&
    entry.embeddingCache.textHash === textHash
  ) {
    return entry.embeddingCache.vector;
  }

  return null;
}

async function getBatchEmbeddings(
  services: SkillShareerServices,
  entries: KnowledgeRecord[],
): Promise<{ embeddings: Map<string, BatchEmbeddingResult>; stats: BatchCacheStats }> {
  const embeddings = new Map<string, BatchEmbeddingResult>();
  const misses: KnowledgeRecord[] = [];

  for (const entry of entries) {
    const cached = getCachedEmbedding(services, entry);
    if (cached) {
      embeddings.set(entry.id, { vector: cached, fromCache: true });
    } else {
      misses.push(entry);
    }
  }

  if (misses.length > 0) {
    const computedVectors = await Promise.all(
      misses.map(async (entry) => {
        try {
          const text = buildEmbeddingText(entry);
          const vector = await getRetrievalInfra(services).embeddings.generate(text);
          return { entryId: entry.id, vector };
        } catch (_error) {
          return { entryId: entry.id, vector: null };
        }
      }),
    );

    for (const result of computedVectors) {
      if (result.vector) {
        embeddings.set(result.entryId, { vector: result.vector, fromCache: false });
      }
    }
  }

  const actualCacheHits = entries.length - misses.length;
  const totalEntries = entries.length;
  const stats: BatchCacheStats = {
    totalEntries,
    cacheHits: actualCacheHits,
    cacheMisses: misses.length,
    hitRate: totalEntries > 0 ? actualCacheHits / totalEntries : 0,
  };

  return { embeddings, stats };
}

export async function optimizedSemanticRecall(
  services: SkillShareerServices,
  queryVector: number[],
  entries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
  seed?: string,
  queryVersions?: ReadonlyArray<{ package: string; version: string }> | null,
): Promise<OptimizedSemanticRecallResult> {
  const { embeddings, stats } = await getBatchEmbeddings(services, entries);
  const freshnessConfig = getRetrievalInfra(services).scoring.freshnessConfig;

  const scoredEntries: Array<{ entry: KnowledgeRecord; score: number }> = [];

  for (const entry of entries) {
    const embeddingResult = embeddings.get(entry.id);
    if (!embeddingResult) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, embeddingResult.vector);
    const score =
      computeScore(similarity, entry, filters, seed) *
      versionMatchMultiplier({
        artifactVersion: artifactVersionOf(entry),
        queryVersions,
        freshnessType: entry.decayMeta?.freshnessType ?? null,
        decayConfig: freshnessConfig,
      });
    scoredEntries.push({ entry, score });
  }

  scoredEntries.sort((a, b) => b.score - a.score);

  return { scoredEntries, cacheStats: stats };
}

export const semanticChannel: KnowledgeReadRecallChannel = {
  name: 'semantic',
  async recall(queryText: string, entries: KnowledgeRecord[]) {
    const services = { retrievalInfra: getDefaultRetrievalInfra() } as SkillShareerServices;
    const queryVector = await getQueryEmbedding(services, queryText);
    const { scoredEntries } = await optimizedSemanticRecall(
      services,
      queryVector,
      entries,
      { labels: [], scopes: [] },
      queryText,
    );
    return scoredEntries.map(({ entry, score }) => ({
      entry,
      channel: 'semantic' as const,
      score,
      tokenMatches: [],
    }));
  },
};
