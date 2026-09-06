import {
  mergeCandidates,
  mergeCandidatesWithGraph,
  rerankCandidates,
  scoreKeywordEntry,
  tokenizeText,
  versionMatchMultiplier,
} from '@trapmap/backend-core';
import { DEFAULT_FRESHNESS_DECAY_CONFIG } from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib/canonical-hash.js';
import { canonicalJsonStringify } from '@trapmap/lib/canonical-json.js';
import { cosineSimilarity, createDeterministicFallbackVector } from '@trapmap/lib/vector.js';
import { bench, describe } from 'vitest';

// 1k × 384 vectors batch — 对齐 Go vector.BatchCosine 64-shard
const DIM = 384;
const N = 1000;
const query = Array.from({ length: DIM }, (_, i) => Math.sin(i * 0.1));
const vectors = Array.from({ length: N }, (_, i) =>
  Array.from({ length: DIM }, (_, j) => Math.cos((i + j) * 0.07)),
);

describe('vector', () => {
  bench('cosineSimilarity loop 1k×384 (JS fallback)', () => {
    for (const v of vectors) cosineSimilarity(query, v);
  });
  bench('createDeterministicFallbackVector 384', () => {
    createDeterministicFallbackVector('hello world trap', 384);
  });
});

describe('ranking', () => {
  const sem = Array.from({ length: 500 }, (_, i) => ({
    entry: { id: `id-${i}` } as any,
    channel: 'semantic' as const,
    score: 0.5 + (i % 10) * 0.03,
    tokenMatches: [],
  }));
  const kw = Array.from({ length: 500 }, (_, i) => ({
    entry: { id: `id-${i}` } as any,
    channel: 'keyword' as const,
    score: 0.4 + (i % 10) * 0.02,
    tokenMatches: [{ token: 'x', fields: ['labels' as const] }],
  }));
  bench('mergeCandidates 500+500', () => {
    mergeCandidates(sem, kw);
  });
  const merged = mergeCandidates(sem, kw);
  bench('rerankCandidates 1k (dual 0.08 + coverage 0.05 + stale -0.1)', () => {
    rerankCandidates(merged as any, ['x', 'y'], {
      maxCandidates: 50,
      freshnessConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
    } as any);
  });
  bench('mergeCandidatesWithGraph 50+20', () => {
    const hybrid = merged.slice(0, 50) as any;
    const graph = sem.slice(0, 20) as any;
    mergeCandidatesWithGraph(hybrid, graph);
  });
});

describe('tokenization', () => {
  const queryTokens = ['hello', 'world', 'trap'];
  const entryTokens = {
    shortcut: new Set(tokenizeText('hello world')),
    detail: new Set(tokenizeText('detail trap')),
    labels: new Set(tokenizeText('hello')),
  };
  bench('scoreKeywordEntry 3/2/1', () => {
    scoreKeywordEntry(queryTokens, entryTokens);
  });
  bench('canonicalJsonStringify + sha256CanonicalJson (1KB)', () => {
    const obj = { b: 2, a: { z: 3, y: [1, 2] }, c: 'hello' };
    canonicalJsonStringify(obj);
    sha256CanonicalJson(obj);
  });
});

describe('dedup', () => {
  // Jaccard: reuse dedup.ts tokens logic via scoreKeywordEntry as proxy
  bench('versionMatchMultiplier', () => {
    versionMatchMultiplier({
      artifactVersion: '1.2.3',
      queryVersions: [{ package: 'trap', version: '1.2.3' }],
      freshnessType: 'versioned',
      decayConfig: DEFAULT_FRESHNESS_DECAY_CONFIG,
    });
  });
});
