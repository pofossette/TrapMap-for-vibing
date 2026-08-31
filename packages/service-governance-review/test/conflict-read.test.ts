import { describe, expect, it, vi } from 'vitest';

import { createGovernanceConflictReadPort } from '../src/conflict-read.js';

describe('governance conflict read adapter', () => {
  it('loads the approved entry and candidate set through the knowledge owner port', async () => {
    const entry = {
      id: 'entry-new',
      shortcut: 'Postgres query timeout',
      detail: 'avoid table scan',
      lifecycleState: 'approved',
    };
    const owner = {
      getById: vi.fn(async () => entry),
      listByFilter: vi.fn(async () => ({
        items: [
          entry,
          {
            id: 'entry-old',
            shortcut: 'Postgres query timeout',
            detail: 'use index planner',
            lifecycleState: 'approved',
          },
        ],
        total: 2,
      })),
    };

    const read = createGovernanceConflictReadPort(owner);

    await expect(read.getApprovedConflictCandidates('entry-new')).resolves.toEqual({
      entry: {
        id: 'entry-new',
        shortcut: 'Postgres query timeout',
        detail: 'avoid table scan',
        lifecycleState: 'approved',
      },
      candidates: [
        {
          id: 'entry-old',
          shortcut: 'Postgres query timeout',
          detail: 'use index planner',
          lifecycleState: 'approved',
        },
      ],
    });
    expect(owner.listByFilter).toHaveBeenCalledWith({ lifecycleState: 'approved' });
  });
});
