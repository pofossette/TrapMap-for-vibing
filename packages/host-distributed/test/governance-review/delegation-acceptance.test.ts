import { describe, expect, it, vi } from 'vitest';

import { InvocationError } from '@trapmap/backend-core';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';

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

  it('covers the full frozen delegation command surface (approve, reject, maintenance, decay, candidate publish)', async () => {
    const approveReviewDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', lifecycleState: 'approved' },
    }));
    const rejectReviewDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', lifecycleState: 'rejected' },
    }));
    const applyMaintenanceDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', action: 'refresh' },
    }));
    const applyDecayDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', action: 'suppress' },
    }));
    const publishCandidateResult = vi.fn(async () => ({
      status: 200,
      body: { candidateId: 'candidate-1', entryId: 'entry-1' },
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
          rejectReviewDecision,
          applyMaintenanceDecision,
          applyDecayDecision,
          publishCandidateResult,
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      },
      { headers: { 'x-request-id': 'req-full', 'x-trace-id': 'trace-full' } },
    );

    const approve = await knowledgeWrite.approveReviewDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
    });
    const reject = await knowledgeWrite.rejectReviewDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
    });
    const maintenance = await knowledgeWrite.applyMaintenanceDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'refresh',
    });
    const decay = await knowledgeWrite.applyDecayDecision({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'suppress',
    });
    const publish = await knowledgeWrite.publishCandidateResult({
      candidateId: 'candidate-1',
      actorId: 'user-1',
      result: { decision: 'publish' },
    });

    expect(approve).toEqual({ entryId: 'entry-1', lifecycleState: 'approved' });
    expect(reject).toEqual({ entryId: 'entry-1', lifecycleState: 'rejected' });
    expect(maintenance).toEqual({ entryId: 'entry-1', action: 'refresh' });
    expect(decay).toEqual({ entryId: 'entry-1', action: 'suppress' });
    expect(publish).toEqual({ candidateId: 'candidate-1', entryId: 'entry-1' });

    expect(approveReviewDecision).toHaveBeenCalledTimes(1);
    expect(rejectReviewDecision).toHaveBeenCalledTimes(1);
    expect(applyMaintenanceDecision).toHaveBeenCalledTimes(1);
    expect(applyDecayDecision).toHaveBeenCalledTimes(1);
    expect(publishCandidateResult).toHaveBeenCalledTimes(1);
  });

  it('maps remote error responses to the canonical InvocationError taxonomy (403/404/409/503/504)', async () => {
    const cases: Array<{
      kind: string;
      error: { status: number; body: { error: string; kind: string } };
      expectedKind: string;
      expectedStatus: number;
    }> = [
      {
        kind: 'forbidden',
        error: { status: 403, body: { error: 'denied', kind: 'forbidden' } },
        expectedKind: 'forbidden',
        expectedStatus: 403,
      },
      {
        kind: 'not-found',
        error: { status: 404, body: { error: 'missing', kind: 'not-found' } },
        expectedKind: 'not-found',
        expectedStatus: 404,
      },
      {
        kind: 'conflict',
        error: { status: 409, body: { error: 'already-reviewed', kind: 'conflict' } },
        expectedKind: 'conflict',
        expectedStatus: 409,
      },
      {
        kind: 'unavailable',
        error: { status: 503, body: { error: 'down', kind: 'unavailable' } },
        expectedKind: 'unavailable',
        expectedStatus: 503,
      },
      {
        kind: 'timeout',
        error: { status: 504, body: { error: 'slow', kind: 'timeout' } },
        expectedKind: 'timeout',
        expectedStatus: 504,
      },
    ];

    for (const testCase of cases) {
      const failingClient = vi.fn(async () => testCase.error);
      const knowledgeWrite = createRemoteKnowledgeWriteClient({
        knowledgeWrite: {
          submit: vi.fn(),
          updateEntry: vi.fn(),
          resubmit: vi.fn(),
          supersede: vi.fn(),
          createTrap: vi.fn(),
          approveReviewDecision: failingClient,
          rejectReviewDecision: vi.fn(),
          applyMaintenanceDecision: vi.fn(),
          applyDecayDecision: vi.fn(),
          publishCandidateResult: vi.fn(),
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      });

      await expect(
        knowledgeWrite.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' }),
      ).rejects.toThrow(InvocationError);

      try {
        await knowledgeWrite.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' });
      } catch (err) {
        expect(err).toBeInstanceOf(InvocationError);
        const invocationError = err as InvocationError;
        expect(invocationError.kind).toBe(testCase.expectedKind);
        expect(invocationError.message).toBe(testCase.error.body.error);
      }
    }
  });

  it('propagates request/trace headers consistently across delegation retries', async () => {
    const approveReviewDecision = vi.fn(async () => ({
      status: 200,
      body: { entryId: 'entry-1', lifecycleState: 'approved' },
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
          applyMaintenanceDecision: vi.fn(),
          applyDecayDecision: vi.fn(),
          publishCandidateResult: vi.fn(),
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      },
      { headers: { 'x-request-id': 'req-retry', 'x-trace-id': 'trace-retry' } },
    );

    await knowledgeWrite.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' });
    await knowledgeWrite.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' });

    expect(approveReviewDecision).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = approveReviewDecision.mock.calls;
    expect(firstCall[1]).toEqual({
      headers: { 'x-request-id': 'req-retry', 'x-trace-id': 'trace-retry' },
    });
    expect(secondCall[1]).toEqual({
      headers: { 'x-request-id': 'req-retry', 'x-trace-id': 'trace-retry' },
    });
  });

  it('supports rpc seam for the governance-review -> knowledge-write pilot without changing the port contract', async () => {
    const invoke = vi.fn(async () => ({
      status: 200,
      body: { ok: true, result: { entryId: 'entry-1', lifecycleState: 'approved' } },
    }));

    const knowledgeWrite = createRemoteKnowledgeWriteClient(
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
          invoke,
          listTraps: vi.fn(),
          getTrap: vi.fn(),
        },
      },
      {
        transport: 'rpc',
        headers: { 'x-request-id': 'req-rpc-hop', 'x-trace-id': 'trace-rpc-hop' },
      },
    );

    await expect(
      knowledgeWrite.approveReviewDecision({ entryId: 'entry-1', actorId: 'user-1' }),
    ).resolves.toEqual({ entryId: 'entry-1', lifecycleState: 'approved' });

    expect(invoke).toHaveBeenCalledWith(
      {
        method: 'approveReviewDecision',
        input: { entryId: 'entry-1', actorId: 'user-1' },
      },
      {
        headers: { 'x-request-id': 'req-rpc-hop', 'x-trace-id': 'trace-rpc-hop' },
      },
    );
  });
});
