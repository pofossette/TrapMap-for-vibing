import { describe, expect, it, vi } from 'vitest';

import { createGovernanceReviewPgOwnerBundle } from './pg-ports.js';

function createPool() {
  const calls: string[] = [];
  return {
    calls,
    pool: {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      }),
    },
  };
}

describe('governance-review PostgreSQL owner bundle', () => {
  it('owns feedback persistence without a host shared repository', async () => {
    const { calls, pool } = createPool();
    const owner = createGovernanceReviewPgOwnerBundle(pool as never);

    const feedbackId = await owner.feedbackRepo.nextId();
    await owner.feedbackRepo.insert({
      id: feedbackId,
      entryId: 'entry-1',
      problemType: 'incorrect',
      description: 'owner-local feedback',
      status: 'open',
      submittedBy: 'user-1',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    } as never);

    expect(owner).toEqual(
      expect.objectContaining({
        feedbackRepo: expect.objectContaining({
          nextId: expect.any(Function),
          insert: expect.any(Function),
          listByFilter: expect.any(Function),
        }),
      }),
    );
    expect(feedbackId).toMatch(/^f_/);
    expect(calls).toContainEqual(expect.stringContaining('INSERT INTO feedback_queue'));
  });
});
