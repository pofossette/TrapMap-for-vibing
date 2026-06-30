import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FILES = [
  'src/shared-infra.ts',
  'src/async-factory.ts',
  'src/store-factory.ts',
  'src/async-transport.ts',
  'src/postgres-store.ts',
  'src/task-queue.ts',
  'src/outbox.ts',
  'src/event-bus.ts',
  'src/rabbitmq-task-queue.ts',
];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/lifecycle/event-bus',
  '@trapmap/server/lib/async/factory',
  '@trapmap/server/lib/async/transport',
  '@trapmap/server/lib/async/rabbitmq-task-queue',
  '@trapmap/server/lib/persistence/create-store',
  '@trapmap/server/lib/persistence/postgres-store',
  '@trapmap/server/lib/store',
  '@trapmap/server/lib/repos/index',
  '@trapmap/server/lib/runtime/runtime-contract',
  '@trapmap/server/lib/runtime/metrics',
  '@trapmap/server/lib/queue/task-queue',
  '@trapmap/server/lib/lifecycle/outbox',
  '@trapmap/server/lib/lifecycle/types',
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
