import { describe, expect, it, vi } from 'vitest';
import { createRemoteKnowledgeWriteClient } from './internal-knowledge-write-client.js';

describe('createRemoteKnowledgeWriteClient', () => {
  it('returns remote publish result and forwards request options', async () => {
    const publishCandidateResult = vi.fn(async () => ({
      status: 200,
      body: { candidateId: 'candidate-1', entryId: 'entry-1' },
    }));

    const client = createRemoteKnowledgeWriteClient(
      {
        knowledgeWrite: {
          submit: vi.fn(),
          updateEntry: vi.fn(),
          resubmit: vi.fn(),
          supersede: vi.fn(),
          createTrap: vi.fn(),
          approveReviewDecision: vi.fn(),
          rejectReviewDecision: vi.fn(),
          applyMaintenanceDecision: vi.fn(),
          applyDecayDecision: vi.fn(),
          publishCandidateResult,
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      },
      {
        headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        timeoutMs: 4321,
      },
    );

    await expect(
      client.publishCandidateResult({
        candidateId: 'candidate-1',
        actorId: 'user-1',
        result: { decision: 'publish' },
      }),
    ).resolves.toEqual({ candidateId: 'candidate-1', entryId: 'entry-1' });

    expect(publishCandidateResult).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        actorId: 'user-1',
        result: { decision: 'publish' },
      },
      {
        headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        timeoutMs: 4321,
      },
    );
  });

  it.each([
    [404, { error: 'missing', kind: 'not-found' }, 'not-found'],
    [409, { error: 'duplicate', kind: 'conflict' }, 'conflict'],
    [503, { error: 'down', kind: 'unavailable' }, 'unavailable'],
    [504, { error: 'slow', kind: 'timeout' }, 'timeout'],
    [403, { error: 'denied', kind: 'forbidden' }, 'forbidden'],
  ] as const)(
    'maps remote status %s into InvocationError kind %s',
    async (_status, body, expectedKind) => {
      const client = createRemoteKnowledgeWriteClient({
        knowledgeWrite: {
          submit: vi.fn(),
          updateEntry: vi.fn(),
          resubmit: vi.fn(),
          supersede: vi.fn(),
          createTrap: vi.fn(),
          approveReviewDecision: vi.fn(async () => ({ status: _status, body })),
          rejectReviewDecision: vi.fn(),
          applyMaintenanceDecision: vi.fn(),
          applyDecayDecision: vi.fn(),
          publishCandidateResult: vi.fn(),
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      });

      await expect(
        client.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' }),
      ).rejects.toMatchObject({ kind: expectedKind, message: body.error });
    },
  );

  it('uses rpc invoke endpoint when the knowledge-write transport is rpc', async () => {
    const invoke = vi.fn(async () => ({
      status: 200,
      body: { ok: true, result: { entryId: 'entry-1', lifecycleState: 'approved' } },
    }));

    const client = createRemoteKnowledgeWriteClient(
      {
        knowledgeWrite: {
          submit: vi.fn(),
          updateEntry: vi.fn(),
          resubmit: vi.fn(),
          supersede: vi.fn(),
          createTrap: vi.fn(),
          approveReviewDecision: vi.fn(),
          rejectReviewDecision: vi.fn(),
          applyMaintenanceDecision: vi.fn(),
          applyDecayDecision: vi.fn(),
          publishCandidateResult: vi.fn(),
          listTraps: vi.fn(),
          getTrap: vi.fn(),
          invoke,
        },
      },
      {
        transport: 'rpc',
        headers: { 'x-request-id': 'req-rpc' },
      },
    );

    await expect(
      client.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' }),
    ).resolves.toEqual({ entryId: 'entry-1', lifecycleState: 'approved' });

    expect(invoke).toHaveBeenCalledWith(
      {
        method: 'approveReviewDecision',
        input: { entryId: 'entry-1', actorId: 'user-1' },
      },
      {
        headers: { 'x-request-id': 'req-rpc' },
      },
    );
  });
});
