import { describe, expect, it, vi } from 'vitest';

import { createGovernanceReviewModule } from './module.ts';

describe('governance review module', () => {
  it('writes a complete owner-local feedback record', async () => {
    const insert = vi.fn(async () => undefined);
    const module = createGovernanceReviewModule({
      knowledgeWrite: {
        approveReviewDecision: vi.fn(),
        rejectReviewDecision: vi.fn(),
        applyMaintenanceDecision: vi.fn(),
        applyDecayDecision: vi.fn(),
      },
      feedbackRepo: {
        nextId: vi.fn(async () => 'feedback-1'),
        insert,
        getById: vi.fn(),
        listByEntry: vi.fn(),
        listByStatus: vi.fn(),
        listByFilter: vi.fn(),
        update: vi.fn(),
      },
      auditLog: { record: vi.fn(async () => undefined) },
    });

    await module.submitFeedback({
      entryId: 'entry-1',
      entryType: 'trap',
      problemType: 'incorrect',
      description: 'The prescribed configuration is no longer valid.',
      actorId: 'user-1',
      submittedByHandle: 'alice',
      customAnswers: [{ prompt: 'What failed?', answer: 'Deployment' }],
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'The prescribed configuration is no longer valid.',
        submittedByUserId: 'user-1',
        submittedByHandle: 'alice',
        status: 'new',
        remediationStatus: null,
        customAnswers: [{ prompt: 'What failed?', answer: 'Deployment' }],
      }),
    );
  });
});
