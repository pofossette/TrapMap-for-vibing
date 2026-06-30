import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CONFIG_FILES = [
  'src/nest/config/config.ts',
  'src/nest/config/ai-provider-config.ts',
  'src/nest/config/graph-db-config.ts',
  'src/nest/config/rag-log.ts',
  'src/nest/config/user-ops-log.ts',
  'src/nest/config/log-rotation.ts',
];

const FORBIDDEN_IMPORTS = [
  '@trapmap/server/lib/ai/',
  '@trapmap/server/lib/graph-query/config',
  '@trapmap/server/lib/rag-log',
  '@trapmap/server/lib/user-ops-log',
];

describe('host-local config import boundary', () => {
  it('does not import config-owned helpers from @trapmap/server', async () => {
    const root = path.resolve(import.meta.dirname, '../../..');

    for (const file of CONFIG_FILES) {
      const source = await readFile(path.join(root, file), 'utf-8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
