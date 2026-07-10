import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('runtime import boundary', () => {
  it('keeps http request hooks independent from the runtime barrel', async () => {
    const source = await readFile(path.join(import.meta.dirname, 'http-hooks.ts'), 'utf-8');

    expect(source).not.toContain("from './index.js'");
    expect(source).toContain("from './metrics.js'");
    expect(source).toContain("from './request-context.js'");
    expect(source).toContain("from './runtime-contract.js'");
  });

  it('uses the store pool seam instead of concrete PostgresStore checks in runtime HTTP surface', async () => {
    const source = await readFile(path.join(import.meta.dirname, 'http-surface.ts'), 'utf-8');

    expect(source).not.toContain('@trapmap/server/lib/persistence/postgres-store.js');
    expect(source).not.toContain('instanceof PostgresStore');
    expect(source).toContain('@trapmap/server/lib/store.js');
  });
});
