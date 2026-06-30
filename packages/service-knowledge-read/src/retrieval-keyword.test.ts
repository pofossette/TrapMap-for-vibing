import { describe, expect, it } from 'vitest';

import { keywordRecall, normalizeQuery, tokenize } from './retrieval-keyword.js';
import type { KnowledgeRecord } from './store.js';

function createTestEntry(overrides: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id: 'test_1',
    teamId: null,
    scope: 'global',
    labels: [],
    shortcut: '',
    detail: '',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      shortcut: '',
      detail: '',
      labels: [],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as KnowledgeRecord;
}

describe('knowledge-read keyword recall', () => {
  it('tokenizes and normalizes query text', () => {
    expect(tokenize('JWT Token Validation!')).toEqual(['jwt', 'token', 'validation']);
    expect(normalizeQuery('a JWT token')).toEqual(['jwt', 'token']);
  });

  it('returns lexical matches sorted by descending score', async () => {
    const candidates = await keywordRecall('keyword match', [
      createTestEntry({
        id: 'entry_low',
        shortcut: 'Some topic',
        detail: 'Brief mention of keyword',
        labels: ['other'],
      }),
      createTestEntry({
        id: 'entry_high',
        shortcut: 'Keyword match title',
        detail: 'This entry is all about keyword match and keyword scoring',
        labels: ['keyword', 'match'],
      }),
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.entry.id).toBe('entry_high');
    expect(candidates[0]?.score).toBeGreaterThanOrEqual(candidates[1]?.score ?? 0);
  });
});
