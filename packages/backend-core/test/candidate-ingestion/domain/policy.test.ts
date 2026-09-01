import { describe, expect, it } from 'vitest';

import {
  DEAD_LETTER_MESSAGE,
  MAX_PROCESSING_ATTEMPTS,
  RECOVERY_REASON,
  RECOVERY_STATUS,
  isActionableCandidateStatus,
  isDeadLetter,
  isInterruptedCandidateStatus,
  isStatusUpdateNoop,
  sameAnalysis,
  sameDuplicateCase,
  sameManualResult,
  statusAfterAnalysis,
} from '../../../src/candidate-ingestion/domain/policy.js';

const analysis = {
  normalizedAt: '2026-07-16T00:01:00.000Z',
  fingerprint: 'sha256:owner-local',
  keywords: ['owner'],
  tokens: ['local'],
};

describe('candidate-ingestion status policy', () => {
  it('exposes the processing attempt cap and dead-letter message', () => {
    expect(MAX_PROCESSING_ATTEMPTS).toBe(3);
    expect(DEAD_LETTER_MESSAGE).toBe('Candidate processing exhausted retries');
  });

  it('recognizes actionable and interrupted candidate statuses', () => {
    expect(isActionableCandidateStatus('received')).toBe(true);
    expect(isActionableCandidateStatus('queued')).toBe(true);
    expect(isActionableCandidateStatus('error')).toBe(true);
    expect(isActionableCandidateStatus('analyzing')).toBe(false);
    expect(isActionableCandidateStatus('resolved')).toBe(false);
    expect(isInterruptedCandidateStatus('queued')).toBe(true);
    expect(isInterruptedCandidateStatus('analyzing')).toBe(true);
    expect(isInterruptedCandidateStatus('received')).toBe(false);
    expect(isInterruptedCandidateStatus('error')).toBe(false);
  });

  it('exposes the recovery status and reason', () => {
    expect(RECOVERY_STATUS).toBe('received');
    expect(RECOVERY_REASON).toBe('Candidate worker restart recovery');
  });

  it('maps analysis outcome to the terminal processing status', () => {
    expect(statusAfterAnalysis(true)).toBe('duplicate_detected');
    expect(statusAfterAnalysis(false)).toBe('ready_for_review');
  });

  it('dead-letters a task only after it exhausts its attempts', () => {
    expect(isDeadLetter(0, 3)).toBe(false);
    expect(isDeadLetter(2, 3)).toBe(false);
    expect(isDeadLetter(3, 3)).toBe(true);
    expect(isDeadLetter(4, 3)).toBe(true);
  });
});

describe('candidate-ingestion status update no-op rule', () => {
  it('skips identical status updates', () => {
    expect(isStatusUpdateNoop('queued', null, 'queued')).toBe(true);
    expect(isStatusUpdateNoop('analyzing', null, 'analyzing')).toBe(true);
    expect(isStatusUpdateNoop('resolved', null, 'resolved')).toBe(true);
    expect(isStatusUpdateNoop('queued', null, 'analyzing')).toBe(false);
  });

  it('skips error updates only when the message matches', () => {
    expect(isStatusUpdateNoop('error', 'boom', 'error', 'boom')).toBe(true);
    expect(isStatusUpdateNoop('error', 'boom', 'error', 'different')).toBe(false);
    expect(isStatusUpdateNoop('error', null, 'error', 'boom')).toBe(false);
    expect(isStatusUpdateNoop('error', 'boom', 'error')).toBe(false);
    expect(isStatusUpdateNoop('error', 'Unknown error', 'error')).toBe(true);
  });
});

describe('candidate-ingestion idempotency comparators', () => {
  it('compares analysis snapshots by deep equality', () => {
    expect(sameAnalysis(analysis, analysis)).toBe(true);
    expect(sameAnalysis(analysis, { ...analysis, fingerprint: 'other' })).toBe(false);
  });

  it('compares manual results including reviewer and merged target', () => {
    const existing = {
      decision: 'merged' as const,
      notes: 'same skill',
      submittedAt: '2026-07-16T00:04:00.000Z',
      submittedBy: 'reviewer-1',
      mergedWith: { entityType: 'skill' as const, entityId: 'skill-1' },
    };
    expect(
      sameManualResult(
        existing,
        {
          decision: 'merged',
          notes: 'same skill',
          mergedWith: { entityType: 'skill', entityId: 'skill-1' },
        },
        'reviewer-1',
      ),
    ).toBe(true);
    expect(
      sameManualResult(existing, { decision: 'merged', notes: 'same skill' }, 'reviewer-1'),
    ).toBe(false);
    expect(
      sameManualResult(
        existing,
        {
          decision: 'merged',
          notes: 'same skill',
          mergedWith: { entityType: 'skill', entityId: 'skill-1' },
        },
        'reviewer-2',
      ),
    ).toBe(false);
  });

  it('compares duplicate cases by deep equality', () => {
    const duplicateCase = {
      id: 'duplicate-1',
      candidateId: 'candidate-1',
      detectedAt: '2026-07-16T00:02:00.000Z',
      detectionVersion: 'v1',
      highestSimilarity: 0.98,
      hasExactDuplicate: false,
      duplicateType: 'semantic' as const,
      matches: [
        {
          entityType: 'skill' as const,
          entityId: 'skill-1',
          entityTitle: 'Existing skill',
          similarityScore: 0.98,
          matchType: 'semantic-similar' as const,
          overlapDetails: {
            sharedKeywords: ['owner'],
            sharedTokens: ['local'],
            textOverlapPercent: 80,
          },
        },
      ],
    };
    expect(sameDuplicateCase(duplicateCase, duplicateCase)).toBe(true);
    expect(sameDuplicateCase(duplicateCase, { ...duplicateCase, id: 'duplicate-2' })).toBe(false);
  });
});
