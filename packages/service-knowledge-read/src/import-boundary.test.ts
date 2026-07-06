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
  'src/retrieval-types.ts',
  'src/store.ts',
];

const FORBIDDEN_IMPORTS = [
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
];

describe('knowledge-read import boundary', () => {
  it('owns retrieval orchestration registries locally', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    for (const file of FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('keeps package-local retrieval seams in searchKnowledge', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const source = await readFile(path.join(root, 'src/search-knowledge.ts'), 'utf-8');

    expect(source).toContain("from './filters.js'");
    expect(source).toContain("from './read-model.js'");
    expect(source).toContain("from './rag-log.js'");
    expect(source).toContain("from './response-assembly.js'");
    expect(source).toContain("from './response-citations.js'");
    expect(source).toContain("from './response-summary.js'");
    expect(source).toContain("from './response-refinement.js'");
  });
});
