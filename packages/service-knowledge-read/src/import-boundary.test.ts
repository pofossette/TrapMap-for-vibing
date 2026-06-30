import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FILES = ['src/server-retrieval-seam.ts'];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/retrieval/recall/keyword',
  '@trapmap/server/lib/retrieval/recall/semantic',
  '@trapmap/server/lib/retrieval/orchestration/recall-coordinator',
  '@trapmap/server/lib/retrieval/orchestration/channel-registry',
  '@trapmap/server/lib/retrieval/orchestration/strategy-registry',
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
});
