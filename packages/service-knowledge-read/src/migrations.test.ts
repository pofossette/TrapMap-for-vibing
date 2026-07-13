import { expect, it } from 'vitest';

import { assertKnowledgeReadMigrationSet } from './migrations.js';

it('uses its complete owner-local migration set', async () => {
  await expect(assertKnowledgeReadMigrationSet()).resolves.toBeUndefined();
});
