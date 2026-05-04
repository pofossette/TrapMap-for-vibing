/**
 * Phase 70 Nyquist Gap Validation - Gap 1: Retrieval merge strategies.
 *
 * Pure function tests - NO mocks needed for merge module.
 * Tests union, intersect, weighted merge behaviors at the hard edges.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_KEYWORD_WEIGHT,
  DEFAULT_SEMANTIC_WEIGHT,
  createSemanticCandidate,
  hasBothChannels,
  mergeCandidates,
} from '../retrieval/merge.js';
import type { RecallCandidate, TokenMatchDetail } from '../retrieval/types.js';
import type { KnowledgeRecord } from '../store.js';

function makeEntry(id: string): KnowledgeRecord {
  return {
    id,
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
  } as KnowledgeRecord;
}

function makeKeywordCandidate(
  entry: KnowledgeRecord,
  score: number,
  tokenMatches: TokenMatchDetail[] = [],
): RecallCandidate {
  return { entry, channel: 'keyword', score, tokenMatches };
}

describe('Gap 1: Retrieval merge strategies (union, intersect, weighted)', () => {
  it('UNION: entries appearing only in one channel still appear in output', () => {
    const eSemantic = makeEntry('semantic_only');
    const eKeyword = makeEntry('keyword_only');

    const result = mergeCandidates(
      [createSemanticCandidate(eSemantic, 0.7)],
      [makeKeywordCandidate(eKeyword, 0.8)],
    );

    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.entry.id);
    expect(ids).toContain('semantic_only');
    expect(ids).toContain('keyword_only');
  });

  it('INTERSECT: entry appearing in both channels gets combined score', () => {
    const entry = makeEntry('shared_entry');
    const result = mergeCandidates(
      [createSemanticCandidate(entry, 0.6)],
      [makeKeywordCandidate(entry, 0.9)],
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.channels).toEqual(['semantic', 'keyword']);
    expect(hasBothChannels(result[0]!)).toBe(true);

    const combined = result[0]!.combinedScore;
    expect(combined).toBeCloseTo(0.6 * DEFAULT_SEMANTIC_WEIGHT + 0.9 * DEFAULT_KEYWORD_WEIGHT);
    expect(combined).not.toBeCloseTo(0.6);
    expect(combined).not.toBeCloseTo(0.9);
  });

  it('WEIGHTED: custom weights 100% keyword effectively ignores semantic channel', () => {
    const entry = makeEntry('e1');
    const result = mergeCandidates(
      [createSemanticCandidate(entry, 0.5)],
      [makeKeywordCandidate(entry, 0.8)],
      { semanticWeight: 0, keywordWeight: 1.0 },
    );

    expect(result[0]!.combinedScore).toBeCloseTo(0.8);
  });

  it('WEIGHTED: custom weights 100% semantic effectively ignores keyword channel', () => {
    const entry = makeEntry('e1');
    const result = mergeCandidates(
      [createSemanticCandidate(entry, 0.5)],
      [makeKeywordCandidate(entry, 0.8)],
      { semanticWeight: 1.0, keywordWeight: 0 },
    );

    expect(result[0]!.combinedScore).toBeCloseTo(0.5);
  });

  it('union of many entries from both channels preserves all unique entries', () => {
    const semEntries = [makeEntry('s1'), makeEntry('s2'), makeEntry('s3')];
    const kwEntries = [makeEntry('k1'), makeEntry('k2'), makeEntry('s2')];

    const result = mergeCandidates(
      semEntries.map((e) => createSemanticCandidate(e, 0.5)),
      kwEntries.map((e) => makeKeywordCandidate(e, 0.5)),
    );

    expect(result).toHaveLength(5);
  });

  it('keyword candidate score zero does not suppress the entry if semantic exists', () => {
    const entry = makeEntry('e1');
    const result = mergeCandidates(
      [createSemanticCandidate(entry, 0.9)],
      [makeKeywordCandidate(entry, 0.0)],
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.combinedScore).toBeCloseTo(0.54);
    expect(result[0]!.channels).toEqual(['semantic', 'keyword']);
  });

  it('semantic score zero does not suppress entry if keyword exists', () => {
    const entry = makeEntry('e1');
    const result = mergeCandidates(
      [createSemanticCandidate(entry, 0.0)],
      [makeKeywordCandidate(entry, 0.9)],
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.combinedScore).toBeCloseTo(0.36);
  });

  it('maxCandidates drops lowest-scoring entries', () => {
    const e1 = makeEntry('low');
    const e2 = makeEntry('mid');
    const e3 = makeEntry('high');

    const result = mergeCandidates(
      [
        createSemanticCandidate(e1, 0.2),
        createSemanticCandidate(e2, 0.5),
        createSemanticCandidate(e3, 0.9),
      ],
      [],
      { maxCandidates: 2 },
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.entry.id).toBe('high');
    expect(result[1]!.entry.id).toBe('mid');
  });
});
