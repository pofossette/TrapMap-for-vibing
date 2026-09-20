import {
  optimizedSemanticRecall,
  getQueryEmbedding,
} from '../packages/service-knowledge-read/src/retrieval-semantic.js';
import { keywordRecall } from '../packages/service-knowledge-read/src/retrieval-keyword.js';
import {
  cosineSimilarity,
  computeScore,
  buildEmbeddingText,
  normalizeQuerySet,
  normalizeQuery,
} from '@trapmap/backend-core';
import { getDefaultRetrievalInfra } from '../packages/service-knowledge-read/src/retrieval-infra.js';
import type { KnowledgeRecord } from '../packages/service-knowledge-read/src/store.js';

const infra = getDefaultRetrievalInfra();
const services = { retrievalInfra: infra } as never;

function makeEntries(count: number): KnowledgeRecord[] {
  const topics = [
    'redis cache stampede during cold start',
    'postgres connection pool exhaustion under burst load',
    'react hydration mismatch after server render',
    'kubernetes readiness probe flapping on slow start',
    'typescript strict null checks migration strategy',
  ];
  const entries: KnowledgeRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const topic = topics[i % topics.length]!;
    entries.push({
      id: 'prof_' + i,
      labels: ['database'],
      scope: 'global',
      shortcut: topic + ' - variant ' + i,
      detail:
        topic +
        '. Mitigate by bounding concurrency and adding backpressure. Profile entry ' +
        i +
        ' with extra padding text approximating a realistic detail field length for embedding and tokenization cost measurement purposes across several lines.',
      labelsMatch: [],
      history: [{ revisionNo: 1 }],
      embeddingCache: null,
      decayMeta: null,
    } as unknown as KnowledgeRecord);
  }
  return entries;
}

async function main() {
  const entries = makeEntries(1000);
  const seed = 'redis cache stampede during cold start variant 7';
  const filters = { labels: [], scopes: ['global', 'project'] as ('global' | 'project')[] };
  const queryVector = await getQueryEmbedding(services, seed);

  const time = async (label: string, runs: number, fn: () => unknown) => {
    const t0 = performance.now();
    for (let i = 0; i < runs; i += 1) await fn();
    console.log(label + ': ' + ((performance.now() - t0) / runs).toFixed(2) + 'ms');
  };

  // cold (first query: embeds all + writes back)
  await time('optimizedSemanticRecall COLD', 2, () =>
    optimizedSemanticRecall(services, queryVector, entries, filters, seed),
  );
  const warmed = entries.filter((e) => e.embeddingCache?.vector).length;
  console.log('warm (embeddingCache populated):', warmed, '/', entries.length);

  await time('optimizedSemanticRecall WARM total', 20, () =>
    optimizedSemanticRecall(services, queryVector, entries, filters, seed),
  );
  await time('buildEmbeddingText x1000 (memo)', 20, () => {
    for (const e of entries) buildEmbeddingText(e);
  });
  await time('normalizeQuery(seed) memo', 20, () => normalizeQuery(seed));
  await time('normalizeQuerySet x1000 (memo)', 20, () => {
    for (const e of entries) normalizeQuerySet(buildEmbeddingText(e));
  });

  const vectors = entries.map((e) => e.embeddingCache?.vector).filter((v): v is number[] => !!v);
  await time('cosineSimilarity x1000', 20, () => {
    for (const v of vectors) cosineSimilarity(queryVector, v);
  });

  await time('computeScore x1000 (seed)', 20, () => {
    for (const e of entries) {
      const v = e.embeddingCache?.vector;
      const sim = v ? cosineSimilarity(queryVector, v) : 0;
      computeScore(sim, e, filters, seed);
    }
  });

  await time('keywordRecall (in-memory)', 10, () => keywordRecall(seed, entries));

  // isolate: cosine+computeScore WITHOUT buildEmbeddingText/hash (pure scoring floor)
  await time('score floor: cosine+computeScore only x1000', 20, () => {
    let idx = 0;
    for (const e of entries) {
      const v = vectors[idx % vectors.length]!;
      idx += 1;
      const sim = cosineSimilarity(queryVector, v);
      computeScore(sim, e, filters, undefined);
    }
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
