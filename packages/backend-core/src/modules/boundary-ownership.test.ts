import { describe, expect, it, vi } from 'vitest';

import { createCandidateIngestionModule } from './candidate-ingestion.js';
import { createGovernanceReviewModule } from './governance-review.js';

describe('service boundary ownership', () => {
  it('review decisions delegate final lifecycle writes to knowledge-write', async () => {
    const approveReviewDecision = vi.fn(async () => ({
      entryId: 'entry-1',
      lifecycleState: 'approved' as const,
    }));

    const module = createGovernanceReviewModule({
      knowledgeWrite: {
        approveReviewDecision,
        rejectReviewDecision: vi.fn(),
        applyMaintenanceDecision: vi.fn(),
        applyDecayDecision: vi.fn(),
      },
      feedbackRepo: {
        nextId: vi.fn(),
        insert: vi.fn(),
        getById: vi.fn(),
        listByEntry: vi.fn(),
        listByStatus: vi.fn(),
        listByFilter: vi.fn(),
        update: vi.fn(),
      },
      auditLog: { record: vi.fn(), query: vi.fn() },
    });

    const result = await module.approve({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'ship it',
    });

    expect(approveReviewDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'ship it',
    });
    expect(result).toEqual({ entryId: 'entry-1', lifecycleState: 'approved' });
  });

  it('candidate publish path delegates to knowledge-write and only uses job-runtime for scheduling', async () => {
    const schedule = vi.fn(async () => 'job-1');
    const publishCandidateResult = vi.fn(async () => ({ candidateId: 'candidate-1' }));
    const markResolved = vi.fn(async () => undefined);

    const module = createCandidateIngestionModule({
      candidateRepo: {
        insert: vi.fn(),
        getById: vi.fn(async () => ({ id: 'candidate-1' })),
        updateStatus: vi.fn(),
        attachAnalysis: vi.fn(),
        attachDuplicateCase: vi.fn(),
        attachManualResult: vi.fn(),
        listByStatus: vi.fn(),
        markResolved,
        findByFingerprint: vi.fn(),
      },
      auditLog: { record: vi.fn(), query: vi.fn() },
      knowledgeWrite: {
        publishCandidateResult,
      },
      jobRuntime: { schedule },
    });

    await module.submit({
      id: 'candidate-1',
      sourceType: 'manual',
      submittedBy: 'user-1',
      originalPayload: { text: 'candidate' },
    });
    await module.publishCandidateResult('candidate-1', { decision: 'publish' }, 'user-1');

    expect(schedule).toHaveBeenCalledWith('candidate-processing', { candidateId: 'candidate-1' });
    expect(publishCandidateResult).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      actorId: 'user-1',
      result: { decision: 'publish' },
    });
    expect(markResolved).toHaveBeenCalledWith('candidate-1', 'user-1');
  });
});
