import { describe, expect, it, vi } from 'vitest';

import {
  buildNormalizedDuplicateInput,
  createCandidateDuplicateDetector,
  type CandidateCorpusReadPort,
} from './index.js';
import type { CandidateCorpusReadPort as ContractCandidateCorpusReadPort } from '@trapmap/contracts';

describe('candidate-ingestion fingerprint and duplicate domain', () => {
  it('uses the shared contracts corpus port for semantic and isolated matching', async () => {
    const corpus: ContractCandidateCorpusReadPort = {
      listApprovedTraps: vi.fn(async (teamId) =>
        teamId === 'team-1'
          ? [
              {
                id: 'trap-semantic',
                teamId: 'team-1',
                shortcut: 'Avoid deeply nested loops',
                detail: 'Prefer map operations for collection transforms.',
                labels: ['performance'],
              },
            ]
          : [],
      ),
      listApprovedSkills: vi.fn(async () => []),
    };
    const candidate = {
      id: 'candidate-semantic',
      sourceType: 'trap' as const,
      submittedBy: 'user-1',
      teamId: 'team-1',
      status: 'received' as const,
      originalPayload: {
        trap: {
          scope: 'project' as const,
          labels: ['performance'],
          shortcut: 'Avoid nested loops',
          detail: 'Prefer map operations for collection transforms.',
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: '2026-07-16T00:00:00.000Z',
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: null,
    };
    const detect = createCandidateDuplicateDetector(corpus, {
      now: () => '2026-07-16T00:01:00.000Z',
      createId: () => 'duplicate-semantic',
    });

    const result = await detect(candidate, buildNormalizedDuplicateInput(candidate));

    expect(result.duplicateCase).toMatchObject({
      duplicateType: 'semantic',
      hasExactDuplicate: false,
      matches: [
        expect.objectContaining({
          matchType: expect.stringMatching(/high-overlap|semantic-similar/),
        }),
      ],
    });
    expect(corpus.listApprovedTraps).toHaveBeenCalledWith('team-1');
  });

  it('uses the injected corpus reader and identifies an exact approved trap', async () => {
    const candidate = {
      id: 'candidate-1',
      sourceType: 'trap' as const,
      submittedBy: 'user-1',
      teamId: 'team-1',
      status: 'received' as const,
      originalPayload: {
        trap: {
          scope: 'project' as const,
          shortcut: 'Avoid nested loops',
          detail: 'Use map instead of nested loops for collections.',
          labels: ['performance'],
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: '2026-07-16T00:00:00.000Z',
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: null,
    };
    const corpus: CandidateCorpusReadPort = {
      listApprovedTraps: vi.fn(async () => [
        {
          id: 'trap-1',
          teamId: 'team-1',
          shortcut: 'Avoid nested loops',
          detail: 'Use map instead of nested loops for collections.',
          labels: ['performance'],
        },
      ]),
      listApprovedSkills: vi.fn(async () => []),
    };

    const normalized = buildNormalizedDuplicateInput(candidate);
    const detect = createCandidateDuplicateDetector(corpus, {
      now: () => '2026-07-16T00:01:00.000Z',
      createId: () => 'duplicate-1',
    });
    const result = await detect(candidate, normalized);

    expect(corpus.listApprovedTraps).toHaveBeenCalledWith('team-1');
    expect(corpus.listApprovedSkills).toHaveBeenCalledWith('team-1');
    expect(result.analysisSnapshot).toMatchObject({
      fingerprint: normalized.fingerprint,
      duplicateTrace: { detector: 'postgresql', matchedLane: 'exact' },
    });
    expect(result.duplicateCase).toMatchObject({
      id: 'duplicate-1',
      candidateId: 'candidate-1',
      duplicateType: 'exact',
      hasExactDuplicate: true,
      matches: [
        expect.objectContaining({ entityType: 'trap', entityId: 'trap-1', matchType: 'exact' }),
      ],
    });
  });

  it('does not expose unapproved corpus records through the port contract', async () => {
    const corpus: CandidateCorpusReadPort = {
      listApprovedTraps: vi.fn(async () => []),
      listApprovedSkills: vi.fn(async () => []),
    };
    const detect = createCandidateDuplicateDetector(corpus, {
      now: () => '2026-07-16T00:01:00.000Z',
      createId: () => 'duplicate-1',
    });
    const candidate = {
      id: 'candidate-2',
      sourceType: 'skill' as const,
      submittedBy: 'user-1',
      teamId: null,
      status: 'received' as const,
      originalPayload: {
        skill: {
          files: [
            { path: 'SKILL.md', sha256: 'a'.repeat(64), sizeBytes: 1, mediaType: 'text/markdown' },
          ],
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: '2026-07-16T00:00:00.000Z',
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: null,
    };
    const result = await detect(candidate, buildNormalizedDuplicateInput(candidate));

    expect(result.duplicateCase).toBeNull();
    expect(result.analysisSnapshot.duplicateTrace).toEqual({
      detector: 'postgresql',
      matchedLane: 'none',
    });
  });
});
