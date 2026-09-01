import type { KnowledgeEntryRecord } from '@trapmap/backend-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKnowledgeEntryProjection,
  invalidateKnowledgeEntryProjection,
  resetKnowledgeEntryProjectionCacheForTests,
} from '../src/entry-projection.js';

function createEntry(
  id: string,
  overrides: Partial<KnowledgeEntryRecord> = {},
): KnowledgeEntryRecord {
  return {
    id,
    content: `content:${id}`,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    teamId: 'team-1',
    ...overrides,
  };
}

describe('knowledge entry projection', () => {
  beforeEach(() => {
    resetKnowledgeEntryProjectionCacheForTests();
  });

  afterEach(() => {
    resetKnowledgeEntryProjectionCacheForTests();
  });

  it('builds a full snapshot on first query and reuses it for subsequent entry reads', async () => {
    const entries = [
      createEntry('entry-1'),
      createEntry('entry-2', { ownerUserId: 'user-2', teamId: 'team-2' }),
    ];
    const knowledgeRepo = {
      listByFilter: vi.fn(async () => ({ items: entries, total: entries.length })),
    };
    const projection = createKnowledgeEntryProjection({ knowledgeRepo });

    await expect(projection.getById('entry-1')).resolves.toEqual(entries[0]);
    await expect(projection.listMine({ userId: 'user-1' })).resolves.toEqual([entries[0]]);
    await expect(projection.getById('entry-2')).resolves.toEqual(entries[1]);

    expect(knowledgeRepo.listByFilter).toHaveBeenCalledTimes(1);
    expect(knowledgeRepo.listByFilter).toHaveBeenCalledWith({});
  });

  it('rebuilds the snapshot after lifecycle invalidation', async () => {
    const knowledgeRepo = {
      listByFilter: vi
        .fn()
        .mockResolvedValueOnce({ items: [createEntry('entry-1', { content: 'before' })], total: 1 })
        .mockResolvedValueOnce({ items: [createEntry('entry-1', { content: 'after' })], total: 1 }),
    };
    const projection = createKnowledgeEntryProjection({ knowledgeRepo });

    await expect(projection.getById('entry-1')).resolves.toMatchObject({ content: 'before' });

    invalidateKnowledgeEntryProjection('approved');

    await expect(projection.getById('entry-1')).resolves.toMatchObject({ content: 'after' });
    expect(knowledgeRepo.listByFilter).toHaveBeenCalledTimes(2);
  });

  it('reports refresh-pending lag and exposes an explicit rebuild after invalidation', async () => {
    const knowledgeRepo = {
      listByFilter: vi
        .fn()
        .mockResolvedValueOnce({ items: [createEntry('entry-1', { content: 'before' })], total: 1 })
        .mockResolvedValueOnce({ items: [createEntry('entry-1', { content: 'after' })], total: 1 }),
    };
    const projection = createKnowledgeEntryProjection({ knowledgeRepo });

    await projection.getById('entry-1');
    invalidateKnowledgeEntryProjection('approved');

    expect(await projection.getStatus()).toMatchObject({
      freshness: 'refresh-pending',
      source: 'temporary-direct-backed-projection',
      fallback: 'direct-authoritative-read',
    });

    await projection.rebuild();

    expect(await projection.getStatus()).toMatchObject({
      freshness: 'current',
      fallback: 'direct-authoritative-read',
    });
    await expect(projection.getById('entry-1')).resolves.toMatchObject({ content: 'after' });
  });

  it('preserves user and optional team filtering for listMine', async () => {
    const entries = [
      createEntry('entry-user-team-1', { ownerUserId: 'user-1', teamId: 'team-1' }),
      createEntry('entry-user-team-2', { ownerUserId: 'user-1', teamId: 'team-2' }),
      createEntry('entry-other-user', { ownerUserId: 'user-2', teamId: 'team-1' }),
    ];
    const projection = createKnowledgeEntryProjection({
      knowledgeRepo: {
        listByFilter: vi.fn(async () => ({ items: entries, total: entries.length })),
      },
    });

    await expect(projection.listMine({ userId: 'user-1' })).resolves.toEqual([
      entries[0],
      entries[1],
    ]);
    await expect(projection.listMine({ userId: 'user-1', teamId: 'team-2' })).resolves.toEqual([
      entries[1],
    ]);
  });
});

// ---------------------------------------------------------------------------
// A5: listMine honors owner.userId (probe for the registered follow-up)
// ---------------------------------------------------------------------------

describe('A5 listMine owner.userId probe', () => {
  it('returns entries owned by the requesting user (non-empty regression)', async () => {
    const entries = [createEntry('entry-1', { ownerUserId: 'user-1' })];
    const projection = createKnowledgeEntryProjection({
      knowledgeRepo: {
        listByFilter: vi.fn(async () => ({ items: entries, total: 1 })),
      },
    });
    await expect(projection.listMine({ userId: 'user-1' })).resolves.toEqual(entries);
  });
});
