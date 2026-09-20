import {
  buildEmbeddingText,
  computeScore,
  cosineSimilarity,
  versionMatchMultiplier,
} from '@trapmap/backend-core';
import type { RetrievalQuery } from '@trapmap/contracts';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';
import { batchCosineWithFallback } from '@trapmap/infra/go-accelerator/fallback.js';

import { nowIso } from '@trapmap/lib';

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

/** sha256 per entry, memoized: the hit path re-hashes the full embedding text
 * on every query otherwise. Deterministic hash → memo keyed by entry object. */
const entryTextHashMemo = new WeakMap<object, string>();

function textHashOf(services: SkillShareerServices, entry: KnowledgeRecord): string {
  const entryKey = entry as object;
  const cached = entryTextHashMemo.get(entryKey);
  if (cached !== undefined) return cached;
  const hash = getRetrievalInfra(services).embeddings.hashText(buildEmbeddingText(entry));
  entryTextHashMemo.set(entryKey, hash);
  return hash;
}

function getCachedEmbedding(
  services: SkillShareerServices,
  entry: KnowledgeRecord,
): number[] | null {
  const textHash = textHashOf(services, entry);

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
          return { entryId: entry.id, vector, textHash: textHashOf(services, entry) };
        } catch (_error) {
          return { entryId: entry.id, vector: null, textHash: null };
        }
      }),
    );

    computedVectors.forEach((result, index) => {
      const entry = misses[index];
      if (!result.vector || !entry) return;
      embeddings.set(result.entryId, { vector: result.vector, fromCache: false });
      // Write-back memo: without this, every query recomputes hash embeddings
      // for the whole eligible set (the semantic channel's dominant cost).
      // Safe because getCachedEmbedding re-validates revision + textHash on
      // every read; the memo dies with its read-model snapshot.
      entry.embeddingCache = {
        vector: result.vector,
        textHash: result.textHash!,
        createdAt: nowIso(),
        revision: entry.history.length,
      };
    });
  }

  if (process.env.TRAPMAP_DEBUG_SEMANTIC && misses.length > 0) {
    console.error(
      '[semantic-debug] missIds:',
      misses
        .slice(0, 4)
        .map((e) => e.id)
        .join(','),
      '| hitIds:',
      entries
        .filter((e) => !misses.includes(e))
        .slice(0, 3)
        .map((e) => e.id)
        .join(','),
      '| missCacheState:',
      misses
        .slice(0, 2)
        .map((e) =>
          JSON.stringify({
            rev: e.embeddingCache?.revision,
            hist: e.history?.length,
            hashOk: e.embeddingCache ? 'set' : 'null',
          }),
        )
        .join(' | '),
    );
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
  const t0 = process.env.TRAPMAP_DEBUG_SEMANTIC ? performance.now() : 0;
  const { embeddings, stats } = await getBatchEmbeddings(services, entries);
  if (process.env.TRAPMAP_DEBUG_SEMANTIC) {
    console.error(
      '[semantic-debug] batchEmbeddings',
      JSON.stringify(stats),
      (performance.now() - t0).toFixed(2) + 'ms',
    );
  }
  const freshnessConfig = getRetrievalInfra(services).scoring.freshnessConfig;

  const scoredEntries: Array<{ entry: KnowledgeRecord; score: number }> = [];

  // Batch cosine via Go accelerator when enabled (distributed only); fallback to per-entry JS.
  // This preserves host-local zero-Go: getGoAcceleratorClient returns disabled client there.
  const goClient = getGoAcceleratorClient();
  const useBatch = goClient.isEnabled && entries.length > 1;

  if (useBatch) {
    const entryIds: string[] = [];
    const vectors: number[][] = [];
    const entryById = new Map<string, KnowledgeRecord>();
    for (const entry of entries) {
      const er = embeddings.get(entry.id);
      if (!er) continue;
      entryIds.push(entry.id);
      vectors.push(er.vector);
      entryById.set(entry.id, entry);
    }
    if (vectors.length > 0) {
      const similarities = await batchCosineWithFallback(queryVector, vectors, goClient);
      for (let idx = 0; idx < entryIds.length; idx++) {
        const entryId = entryIds[idx]!;
        const entry = entryById.get(entryId)!;
        const similarity = similarities[idx] ?? cosineSimilarity(queryVector, vectors[idx]!);
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
  }

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
  if (process.env.TRAPMAP_DEBUG_SEMANTIC) {
    console.error(
      '[semantic-debug] recall total',
      (performance.now() - t0).toFixed(2) + 'ms',
      'entries:',
      entries.length,
    );
  }

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
