import { describe, expect, it, vi } from 'vitest';

import { migrateGovernanceSnapshot } from './snapshot-backfill.js';

const feedback = { id: 'feedback_1', entryId: 'entry_1', status: 'new' } as never;
const conflict = { id: 'conflict_1', entryIdA: 'entry_1', entryIdB: 'entry_2' } as never;

describe('governance snapshot backfill', () => {
  it('persists feedback and conflicts through owner ports and verifies reruns', async () => {
    const feedbacks = new Map<string, typeof feedback>();
    const conflicts = new Map<string, typeof conflict>();
    const owner = {
      feedbackRepo: {
        insert: vi.fn(async (record) => feedbacks.set(record.id, record)),
        getById: vi.fn(async (id) => feedbacks.get(id) ?? null),
      },
      conflictProjection: {
        upsert: vi.fn(async (record) => conflicts.set(record.id, record)),
        getById: vi.fn(async (id) => conflicts.get(id) ?? null),
      },
    };
    const snapshot = { feedbackQueue: [feedback], conflicts: [conflict] };

    await expect(migrateGovernanceSnapshot({ owner, snapshot })).resolves.toEqual({
      migrated: 2,
      skipped: 0,
      errors: [],
      verified: 2,
    });
    await expect(migrateGovernanceSnapshot({ owner, snapshot })).resolves.toEqual({
      migrated: 0,
      skipped: 2,
      errors: [],
      verified: 2,
    });
  });
});
