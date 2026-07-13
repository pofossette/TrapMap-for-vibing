import { expect, it } from 'vitest';

import { assertKnowledgeWriteMigrationSet } from './migrations.js';

it('uses its complete owner-local migration set', async () => {
  await expect(assertKnowledgeWriteMigrationSet()).resolves.toBeUndefined();
});
