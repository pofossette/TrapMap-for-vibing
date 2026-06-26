import { describe, expect, it, vi } from 'vitest';

import { InvocationError } from '../invocation/invocation-model.js';
import { createCandidateIngestionModule } from '../candidate-ingestion/index.js';
import { createGovernanceReviewModule } from '../governance-review/index.js';

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

  it('candidate publish does not resolve candidate when remote publish fails', async () => {
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
        publishCandidateResult: vi.fn(async () => {
          throw InvocationError.conflict('duplicate publish');
        }),
      },
      jobRuntime: { schedule: vi.fn() },
    });

    await expect(
      module.publishCandidateResult('candidate-1', { decision: 'publish' }, 'user-1'),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(markResolved).not.toHaveBeenCalled();
  });

  it('review maintenance and decay delegate through knowledge-write only', async () => {
    const applyMaintenanceDecision = vi.fn(async () => ({
      entryId: 'entry-1',
      action: 'refresh-metadata',
    }));
    const applyDecayDecision = vi.fn(async () => ({
      entryId: 'entry-1',
      action: 'suppress',
    }));

    const module = createGovernanceReviewModule({
      knowledgeWrite: {
        approveReviewDecision: vi.fn(),
        rejectReviewDecision: vi.fn(),
        applyMaintenanceDecision,
        applyDecayDecision,
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

    await expect(
      module.applyMaintenance({
        entryId: 'entry-1',
        actorId: 'user-1',
        action: 'refresh-metadata',
      }),
    ).resolves.toEqual({ entryId: 'entry-1', action: 'refresh-metadata' });
    await expect(
      module.applyDecay({
        entryId: 'entry-1',
        actorId: 'user-1',
        action: 'suppress',
      }),
    ).resolves.toEqual({ entryId: 'entry-1', action: 'suppress' });

    expect(applyMaintenanceDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'refresh-metadata',
    });
    expect(applyDecayDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'suppress',
    });
  });
});
