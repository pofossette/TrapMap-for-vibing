import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FILES = [
  'src/server-retrieval-seam.ts',
  'src/retrieval-orchestration.ts',
  'src/retrieval-keyword.ts',
  'src/retrieval-semantic.ts',
  'src/retrieval-recall-coordinator.ts',
  'src/search-knowledge.ts',
  'src/filters.ts',
  'src/read-model.ts',
  'src/rag-log.ts',
  'src/context.ts',
  'src/retrieval-infra.ts',
  'src/retrieval-types.ts',
  'src/store.ts',
];

const RETRIEVAL_CORE_FILES = [
  'src/retrieval-semantic.ts',
  'src/retrieval-recall-coordinator.ts',
  'src/search-knowledge.ts',
];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/cache/query-embedding-cache.js',
  '@trapmap/server/lib/conflict/index.js',
  '@trapmap/server/lib/decay/index.js',
  '@trapmap/server/lib/embeddings.js',
  '@trapmap/server/lib/retrieval/recall/keyword',
  '@trapmap/server/lib/retrieval/recall/semantic',
  '@trapmap/server/lib/retrieval/recall/db-search.js',
  '@trapmap/server/lib/retrieval/recall/graph-assisted.js',
  '@trapmap/server/lib/retrieval/recall/pg-keyword.js',
  '@trapmap/server/lib/retrieval/orchestration/recall-coordinator',
  '@trapmap/server/lib/retrieval/orchestration/channel-registry',
  '@trapmap/server/lib/retrieval/orchestration/strategy-registry',
  '@trapmap/server/lib/retrieval/orchestration/index.js',
  '@trapmap/server/lib/retrieval/scoring/index.js',
  '@trapmap/server/lib/retrieval/types',
  '@trapmap/server/lib/retrieval.js',
  '@trapmap/server/lib/retrieval/orchestration/filters',
  '@trapmap/server/lib/retrieval/read-model',
  '@trapmap/server/lib/rag-log',
  '@trapmap/server/lib/context',
  '@trapmap/server/lib/ids',
  '@trapmap/server/lib/log-rotation',
  '@trapmap/server/lib/store',
  '@trapmap/server/lib/retrieval/types.js',
  '@trapmap/server/lib/activation-policy.js',
  '@trapmap/server/lib/cache/retrieval-read-model-cache.js',
  '@trapmap/server/lib/feedback/remediation.js',
];

describe('knowledge-read import boundary', () => {
  it('keeps retrieval core files free of direct server retrieval internals', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    for (const file of RETRIEVAL_CORE_FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('owns retrieval orchestration registries locally', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    for (const file of FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of [
        '@trapmap/server/lib/retrieval/recall/keyword',
        '@trapmap/server/lib/retrieval/recall/semantic',
        '@trapmap/server/lib/retrieval/orchestration/recall-coordinator',
        '@trapmap/server/lib/retrieval/orchestration/channel-registry',
        '@trapmap/server/lib/retrieval/orchestration/strategy-registry',
        '@trapmap/server/lib/retrieval/types',
        '@trapmap/server/lib/retrieval.js',
        '@trapmap/server/lib/retrieval/orchestration/filters',
        '@trapmap/server/lib/retrieval/read-model',
        '@trapmap/server/lib/rag-log',
        '@trapmap/server/lib/context',
        '@trapmap/server/lib/ids',
        '@trapmap/server/lib/log-rotation',
        '@trapmap/server/lib/store',
        '@trapmap/server/lib/retrieval/types.js',
        '@trapmap/server/lib/activation-policy.js',
        '@trapmap/server/lib/cache/retrieval-read-model-cache.js',
        '@trapmap/server/lib/feedback/remediation.js',
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('keeps package-local retrieval seams in searchKnowledge', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const source = await readFile(path.join(root, 'src/search-knowledge.ts'), 'utf-8');

    expect(source).toContain("from './retrieval-infra.js'");
    expect(source).toContain("from './filters.js'");
    expect(source).toContain("from './read-model.js'");
    expect(source).toContain("from './rag-log.js'");
    expect(source).toContain("from './response-assembly.js'");
    expect(source).toContain("from './response-citations.js'");
    expect(source).toContain("from './response-summary.js'");
    expect(source).toContain("from './response-refinement.js'");
  });

  it('uses local seam names that do not mirror server duplicate export names', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const orchestration = await readFile(
      path.join(root, 'src/retrieval-orchestration.ts'),
      'utf-8',
    );
    const coordinator = await readFile(
      path.join(root, 'src/retrieval-recall-coordinator.ts'),
      'utf-8',
    );

    expect(orchestration).toContain('export interface KnowledgeReadRecallChannel');
    expect(orchestration).not.toContain('export interface RecallChannel');
    expect(coordinator).toContain('export async function graphAssistedHybridRecall');
    expect(coordinator).not.toContain('export async function graphAssistedRecall');
  });

  it('routes retrieval internals through the local server seam', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const seamSource = await readFile(path.join(root, 'src/server-retrieval-seam.ts'), 'utf-8');
    const defaultInfraSource = await readFile(
      path.join(root, 'src/retrieval-infra-default.ts'),
      'utf-8',
    );

    expect(seamSource).toContain('createKnowledgeReadRetrievalInfra');
    expect(seamSource).toContain('KnowledgeReadRetrievalInfra');
    expect(seamSource).not.toContain('createPgKeywordRecall');
    expect(seamSource).not.toContain('vectorSimilaritySearch');
    expect(defaultInfraSource).toContain('createPgKeywordRecall');
    expect(defaultInfraSource).toContain('vectorSimilaritySearch');
  });
});
