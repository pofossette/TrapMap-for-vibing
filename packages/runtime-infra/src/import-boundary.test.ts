import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FILES = ['src/shared-infra.ts', 'src/async-factory.ts', 'src/store-factory.ts'];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/lifecycle/event-bus',
  '@trapmap/server/lib/async/factory',
  '@trapmap/server/lib/async/transport',
  '@trapmap/server/lib/async/rabbitmq-task-queue',
  '@trapmap/server/lib/persistence/create-store',
  '@trapmap/server/lib/persistence/postgres-store',
  '@trapmap/server/lib/store',
  '@trapmap/server/lib/repos/index',
];

describe('runtime-infra import boundary', () => {
  it('owns lifecycle event bus locally', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    for (const file of FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
