/**
 * Phase 70 Nyquist Gap Validation - Gap 2: Semantic recall scoring.
 *
 * Tests correct scoring, embedding text construction, cosine similarity,
 * and batch embedding behaviors.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEmbeddingText,
  computeScore,
  cosineSimilarity,
  getBatchEmbeddings,
  optimizedSemanticRecall,
} from '@trapmap/server/lib/retrieval/recall/semantic.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

vi.mock('../embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  hashEmbeddingText: vi.fn().mockReturnValue('mock-hash-123'),
}));

import { generateEmbedding } from '@trapmap/server/lib/embeddings.js';

function makeEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
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

describe('Gap 2: Semantic recall returns relevant results with correct scoring', () => {
  beforeEach(() => {
    vi.mocked(generateEmbedding).mockClear();
  });

  it('buildEmbeddingText concatenates fields with newlines, not spaces', () => {
    const entry = makeEntry({
      shortcut: 'Title',
      detail: 'Body',
      labels: ['tag1', 'tag2'],
    });

    const text = buildEmbeddingText(entry);

    expect(text).toBe('Title\nBody\ntag1 tag2');
    expect(text).not.toBe('Title Body tag1 tag2');
  });

  it('computeScore with similarity=0 and label+scope boosts still produces non-zero score', () => {
    const entry = makeEntry({ labels: ['security'], scope: 'global' });
    const filters = { labels: ['security'], scopes: ['global'] };

    const score = computeScore(0, entry, filters);

    // 0 + 0.05 (label match) + 0.03 (scope match) = 0.08
    expect(score).toBeCloseTo(0.08);
  });

  it('computeScore caps at exactly 1.0 even with max boosts', () => {
    const entry = makeEntry({
      labels: ['a', 'b', 'c', 'd', 'e'],
      scope: 'project',
    });
    const filters = { labels: ['a', 'b', 'c', 'd', 'e'], scopes: ['project'] };

    const score = computeScore(1.0, entry, filters);

    expect(score).toBe(1.0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('cosineSimilarity with large orthogonal vectors returns 0', () => {
    const a = new Array(100).fill(0);
    const b = new Array(100).fill(0);
    a[0] = 1;
    b[1] = 1;

    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('optimizedSemanticRecall sorts entries by score descending', async () => {
    // Use a cached entry for 'high' with a known vector and an uncached 'low'
    // The mock generateEmbedding returns [0.1, 0.2, 0.3] for uncached entries.
    // Query vector is orthogonal-ish to mock vector, so similarity is low.
    // The 'high' entry gets label+scope boosts that push it above 'low'.
    const cachedVector = [1.0, 0.0, 0.0]; // orthogonal to [0.1, 0.2, 0.3]
    const highBoost = makeEntry({
      id: 'high',
      labels: ['match', 'match2'],
      scope: 'project',
      history: [{ revision: 1 } as any],
      embeddingCache: {
        textHash: 'mock-hash-123',
        vector: cachedVector,
        revision: 1,
      },
      indexState: null,
    } as any);
    const lowBoost = makeEntry({
      id: 'low',
      labels: [],
      scope: 'global',
      embeddingCache: null,
      indexState: null,
    } as any);

    // Query vector = cachedVector, so cosineSim(query, high) = 1.0
    // mock embedding for low = [0.1, 0.2, 0.3], cosineSim(query, low) = 0.1/sqrt(0.14) ~ 0.267
    const queryVector = [1.0, 0.0, 0.0];
    const filters = { labels: ['match', 'match2'], scopes: ['project'] };

    const { scoredEntries } = await optimizedSemanticRecall(
      queryVector,
      [lowBoost, highBoost],
      filters,
    );

    expect(scoredEntries).toHaveLength(2);
    expect(scoredEntries[0]!.entry.id).toBe('high');
    expect(scoredEntries[0]!.score).toBeGreaterThan(scoredEntries[1]!.score);
  });

  it('getBatchEmbeddings skips failed embedding computation silently', async () => {
    vi.mocked(generateEmbedding).mockRejectedValueOnce(new Error('API rate limit'));

    const entry = makeEntry({
      id: 'failing_entry',
      embeddingCache: null,
      indexState: null,
    } as any);

    const { embeddings, stats } = await getBatchEmbeddings([entry]);

    expect(embeddings.has('failing_entry')).toBe(false);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHits).toBe(0);
  });

  it('cosineSimilarity throws for mismatched dimensions', () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow('Vector dimensions must match');
  });

  it('cosineSimilarity returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('computeScore ignores scope boost when scopes has multiple values', () => {
    const entry = makeEntry({ labels: [], scope: 'project' });
    const filters = { labels: [], scopes: ['project', 'global'] };

    const score = computeScore(0.8, entry, filters);

    // scopes.length !== 1, so no scope boost
    expect(score).toBeCloseTo(0.8);
  });
});
