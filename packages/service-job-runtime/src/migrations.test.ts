import { expect, it } from 'vitest';

import { assertJobRuntimeMigrationSet } from './migrations.js';

it('uses its complete owner-local migration set', async () => {
  await expect(assertJobRuntimeMigrationSet()).resolves.toBeUndefined();
});
