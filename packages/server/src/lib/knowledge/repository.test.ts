import { describe, expect, it } from 'vitest';

import { createKnowledgeRepository } from './repository.js';

describe('createKnowledgeRepository', () => {
  it('requires a PostgreSQL pool instead of falling back to snapshot storage', () => {
    expect(() => createKnowledgeRepository({ store: {} as never })).toThrow(
      'knowledge writes require a PostgreSQL pool',
    );
  });
});
