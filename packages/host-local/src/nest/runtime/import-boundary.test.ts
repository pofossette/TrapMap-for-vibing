import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const RUNTIME_FILES = [
  'src/nest/runtime/shared-infra.ts',
  'src/nest/runtime/retrieval-assembly.ts',
  'src/nest/runtime/host-runtime.ts',
];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/async/factory',
  '@trapmap/server/lib/ai/index',
  '@trapmap/server/lib/async/transport',
  '@trapmap/server/lib/embeddings',
  '@trapmap/server/lib/graph-query/backend',
  '@trapmap/server/lib/graph-query/memory-backend',
  '@trapmap/server/lib/indexing/adapters/index',
  '@trapmap/server/lib/lifecycle/event-bus',
  '@trapmap/server/lib/persistence/create-store',
  '@trapmap/server/lib/persistence/postgres-store',
  '@trapmap/server/lib/repos/index',
  '@trapmap/server/lib/store',
  '@trapmap/server/lib/retrieval/recall/keyword',
  '@trapmap/server/lib/retrieval/recall/semantic',
  '@trapmap/server/lib/retrieval/orchestration/channel-registry',
  '@trapmap/server/lib/retrieval/orchestration/recall-coordinator',
  '@trapmap/server/lib/retrieval/orchestration/strategy-registry',
  '@trapmap/server/lib/retrieval.js',
];

describe('host-local runtime import boundary', () => {
  it('does not import retrieval seams directly from @trapmap/server', async () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    for (const file of RUNTIME_FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
