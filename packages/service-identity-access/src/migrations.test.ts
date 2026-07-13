import { expect, it } from 'vitest';

import { assertIdentityAccessMigrationSet } from './migrations.js';

it('uses its complete owner-local migration set', async () => {
  await expect(assertIdentityAccessMigrationSet()).resolves.toBeUndefined();
});
