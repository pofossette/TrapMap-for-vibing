import { describe, expect, it, vi } from 'vitest';

import { createRemoteKnowledgeWriteClient } from '../shared/internal-knowledge-write-client.js';

describe('governance-review delegation acceptance', () => {
  it('delegates authoritative review and lifecycle writes to remote knowledge-write with request context', async () => {
    const approveReviewDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', lifecycleState: 'approved' },
    }));
    const applyMaintenanceDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', action: 'refresh' },
    }));
    const applyDecayDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', action: 'suppress' },
    }));

    const knowledgeWrite = createRemoteKnowledgeWriteClient(
      {
        knowledgeWrite: {
          submit: vi.fn(),
          updateEntry: vi.fn(),
          resubmit: vi.fn(),
          supersede: vi.fn(),
          createTrap: vi.fn(),
          approveReviewDecision,
          rejectReviewDecision: vi.fn(),
          applyMaintenanceDecision,
          applyDecayDecision,
          publishCandidateResult: vi.fn(),
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      },
      {
        headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        timeoutMs: 2500,
      },
    );

    await knowledgeWrite.approveReviewDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
    });
    await knowledgeWrite.applyMaintenanceDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'refresh',
    });
    await knowledgeWrite.applyDecayDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'suppress',
    });

    expect(approveReviewDecision).toHaveBeenCalledWith(
      { entryId: 'entry-1', actorId: 'user-1' },
      { headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' }, timeoutMs: 2500 },
    );
    expect(applyMaintenanceDecision).toHaveBeenCalledWith(
      { entryId: 'entry-1', actorId: 'user-1', action: 'refresh' },
      { headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' }, timeoutMs: 2500 },
    );
    expect(applyDecayDecision).toHaveBeenCalledWith(
      { entryId: 'entry-1', actorId: 'user-1', action: 'suppress' },
      { headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' }, timeoutMs: 2500 },
    );
  });
});
