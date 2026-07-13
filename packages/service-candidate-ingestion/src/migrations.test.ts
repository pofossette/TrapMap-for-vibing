import { expect, it } from 'vitest';

import { assertCandidateIngestionMigrationSet } from './migrations.js';

it('uses its complete owner-local migration set', async () => {
  await expect(assertCandidateIngestionMigrationSet()).resolves.toBeUndefined();
});
