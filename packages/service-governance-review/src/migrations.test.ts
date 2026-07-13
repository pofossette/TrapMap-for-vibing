import { expect, it } from 'vitest';

import { assertGovernanceReviewMigrationSet } from './migrations.js';

it('uses its complete owner-local migration set', async () => {
  await expect(assertGovernanceReviewMigrationSet()).resolves.toBeUndefined();
});
