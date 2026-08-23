import { describe, expect, it, vi } from 'vitest';

import { createGovernanceReviewModule } from './module.ts';

describe('governance review return-for-correction', () => {
  it('delegates to the knowledge-write owner and audits the decision', async () => {
    const returnReviewDecision = vi.fn(async () => ({
      entryId: 'entry-1',
      lifecycleState: 'submitted' as const,
    }));
    const record = vi.fn(async () => undefined);
    const module = createGovernanceReviewModule({
      knowledgeWrite: {
        approveReviewDecision: vi.fn(),
        rejectReviewDecision: vi.fn(),
        returnReviewDecision,
        applyMaintenanceDecision: vi.fn(),
        applyDecayDecision: vi.fn(),
      },
      feedbackRepo: {
        nextId: vi.fn(async () => 'feedback-1'),
        insert: vi.fn(async () => undefined),
        getById: vi.fn(),
        listByEntry: vi.fn(),
        listByStatus: vi.fn(),
        listByFilter: vi.fn(),
        update: vi.fn(),
      },
      auditLog: { record },
    });

    await expect(
      module.returnForCorrection({
        entryId: 'entry-1',
        actorId: 'reviewer-1',
        note: 'revise the boundary fields',
      }),
    ).resolves.toEqual({ entryId: 'entry-1', lifecycleState: 'submitted' });

    expect(returnReviewDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'reviewer-1',
      note: 'revise the boundary fields',
    });
    expect(record).toHaveBeenCalledWith({
      action: 'review.return-for-correction',
      actorId: 'reviewer-1',
      entityId: 'entry-1',
      metadata: { note: 'revise the boundary fields', evidence: null },
    });
  });
});
