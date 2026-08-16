import { describe, expect, it } from 'vitest';

import {
  DatabaseOwnershipError,
  assertDatabaseWriteOwner,
  getDatabaseWriteOwner,
  withDatabaseWriteGuard,
} from './database-ownership.js';

describe('distributed database ownership guard', () => {
  it('accepts the declared owner for an authoritative table family', () => {
    expect(getDatabaseWriteOwner('knowledge')).toBe('knowledge-write');
    expect(() => assertDatabaseWriteOwner('knowledge-write', 'knowledge')).not.toThrow();
  });

  it('rejects cross-owner writes with an explainable error', () => {
    expect(() => assertDatabaseWriteOwner('governance-review', 'knowledge')).toThrow(
      DatabaseOwnershipError,
    );
    expect(() => assertDatabaseWriteOwner('governance-review', 'knowledge')).toThrow(
      /knowledge-write owns knowledge/i,
    );
  });

  it('guards repository mutation calls while preserving cross-owner reads', async () => {
    const repository = {
      getById: async () => ({ id: 'entry-1' }),
      insert: async () => undefined,
      updateStatus: async () => undefined,
    };
    const guarded = withDatabaseWriteGuard(repository, 'governance-review', 'knowledge');

    await expect(guarded.getById()).resolves.toEqual({ id: 'entry-1' });
    expect(() => guarded.insert()).toThrow(/knowledge-write owns knowledge/i);
    expect(() => guarded.updateStatus()).toThrow(/knowledge-write owns knowledge/i);
  });
});
