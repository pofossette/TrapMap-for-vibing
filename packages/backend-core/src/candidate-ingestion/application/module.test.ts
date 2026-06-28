import { describe, expect, it, vi } from 'vitest';

import type { CandidateIngestionDeps } from './module.js';
import { createCandidateIngestionModule } from './module.js';

function createDeps(overrides: Partial<CandidateIngestionDeps> = {}): CandidateIngestionDeps {
  return {
    candidateRepo: {
      insert: vi.fn(),
      getById: vi.fn(),
      updateStatus: vi.fn(),
      attachAnalysis: vi.fn(),
      attachDuplicateCase: vi.fn(),
      attachManualResult: vi.fn(),
      listByStatus: vi.fn(),
      markResolved: vi.fn(),
      findByFingerprint: vi.fn(),
    },
    auditLog: {
      record: vi.fn(),
      query: vi.fn(),
    },
    knowledgeWrite: {
      publishCandidateResult: vi.fn(async ({ candidateId }) => ({ candidateId })),
    },
    ...overrides,
  };
}

describe('createCandidateIngestionModule', () => {
  it('routes applyResolution through candidate-ingestion and knowledge-write ownership', async () => {
    const deps = createDeps();
    vi.mocked(deps.candidateRepo.getById).mockResolvedValue({
      id: 'candidate-1',
      sourceType: 'trap',
      submittedBy: 'user-1',
      teamId: 'team-1',
      status: 'duplicate_detected',
      originalPayload: {
        trap: {
          scope: 'project',
          labels: ['dup'],
          shortcut: 'dup shortcut',
          detail: 'dup detail',
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: '2026-06-28T00:00:00.000Z',
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: {
        decision: 'independent',
        notes: 'publish it',
        submittedAt: '2026-06-28T00:00:00.000Z',
        submittedBy: 'reviewer-1',
      },
    } as any);

    const module = createCandidateIngestionModule(deps);

    await module.applyResolution(
      'candidate-1',
      { decision: 'independent', notes: 'publish it' },
      'reviewer-1',
    );

    expect(deps.knowledgeWrite.publishCandidateResult).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      actorId: 'reviewer-1',
      result: {
        decision: 'independent',
        notes: 'publish it',
        submittedAt: '2026-06-28T00:00:00.000Z',
        submittedBy: 'reviewer-1',
      },
    });
    expect(deps.candidateRepo.markResolved).toHaveBeenCalledWith('candidate-1', 'reviewer-1');
  });
});
