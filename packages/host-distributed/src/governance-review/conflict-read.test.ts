import { describe, expect, it, vi } from 'vitest';

import { createDistributedGovernanceConflictReadPort } from './conflict-read.js';

describe('distributed governance conflict read port', () => {
  it('reads approved candidates through the knowledge-write internal client', async () => {
    const getConflictCandidates = vi.fn().mockResolvedValue({
      status: 200,
      body: {
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
      },
    });
    const read = createDistributedGovernanceConflictReadPort({
      knowledgeWrite: { getConflictCandidates },
    } as never);

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
    expect(getConflictCandidates).toHaveBeenCalledWith('entry-new');
  });
});
