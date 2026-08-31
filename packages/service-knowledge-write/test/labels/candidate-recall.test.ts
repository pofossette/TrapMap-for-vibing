import { describe, expect, it, vi } from 'vitest';

import type { LabelAlignmentCandidate } from '@trapmap/contracts';

import {
  HARD_MAX_CANDIDATES,
  RECOMMENDED_MAX_CANDIDATES,
  recallCandidates,
} from '../../src/labels/candidate-recall.js';
import type {
  CanonicalLabelRecord,
  LabelAliasRecord,
  LabelRepository,
} from '../../src/labels/repository.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLabel(overrides: Partial<CanonicalLabelRecord> = {}): CanonicalLabelRecord {
  return {
    id: 'lbl_test',
    kind: 'cue',
    canonicalName: 'test-label',
    normalizedName: 'test-label',
    definition: null,
    status: 'active',
    mergedIntoLabelId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAlias(overrides: Partial<LabelAliasRecord> = {}): LabelAliasRecord {
  return {
    alias: 'test-alias',
    normalizedAlias: 'test-alias',
    canonicalLabelId: 'lbl_test',
    source: 'manual',
    confidence: 1.0,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockRepo(overrides: Partial<LabelRepository> = {}): LabelRepository {
  return {
    findCanonicalById: vi.fn().mockResolvedValue(null),
    findCanonicalByAlias: vi.fn().mockResolvedValue(null),
    upsertCanonicalLabel: vi.fn().mockResolvedValue(makeLabel()),
    upsertAlias: vi.fn().mockResolvedValue(undefined),
    searchCandidates: vi.fn().mockResolvedValue([]),
    searchCandidatesByEmbedding: vi.fn().mockResolvedValue([]),
    upsertEmbedding: vi.fn().mockResolvedValue(undefined),
    recordAlignmentEvent: vi.fn().mockResolvedValue(undefined),
    mergeCanonicalLabels: vi.fn().mockResolvedValue(undefined),
    listActive: vi.fn().mockResolvedValue([]),
    listAliases: vi.fn().mockResolvedValue([]),
    listAlignmentEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recallCandidates', () => {
  it('returns empty candidates when catalog is empty', async () => {
    const repo = makeMockRepo();
    const result = await recallCandidates(repo, 'unknown-label');

    expect(result.candidates).toHaveLength(0);
    expect(result.recallBreakdown.exactAliasCount).toBe(0);
    expect(result.recallBreakdown.normalizedNameCount).toBe(0);
    expect(result.recallBreakdown.embeddingCount).toBe(0);
  });

  it('returns exact alias match with highest priority', async () => {
    const label = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(label),
      listAliases: vi
        .fn()
        .mockResolvedValue([
          makeAlias({ alias: 'timeout-issue', canonicalLabelId: 'lbl_timeout' }),
          makeAlias({ alias: 'container-timeout', canonicalLabelId: 'lbl_timeout' }),
        ]),
    });

    const result = await recallCandidates(repo, 'pod-timeout');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.id).toBe('lbl_timeout');
    expect(result.candidates[0]!.recallReason).toBe('exact-alias');
    expect(result.candidates[0]!.aliases).toContain('timeout-issue');
    expect(result.recallBreakdown.exactAliasCount).toBe(1);
  });

  it('adds normalized name matches after exact alias', async () => {
    const exactLabel = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const nameLabel = makeLabel({ id: 'lbl_slow', canonicalName: 'slow-response' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(exactLabel),
      listAliases: vi.fn().mockResolvedValue([]),
      searchCandidates: vi
        .fn()
        .mockResolvedValue([
          { label: nameLabel, aliases: [], recallReason: 'normalized-name' as const },
        ]),
    });

    const result = await recallCandidates(repo, 'timeout');

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0]!.recallReason).toBe('exact-alias');
  });

  it('caps candidates at HARD_MAX_CANDIDATES', async () => {
    const labels = Array.from({ length: 10 }, (_, i) =>
      makeLabel({ id: `lbl_${i}`, canonicalName: `label-${i}` }),
    );
    const repo = makeMockRepo({
      searchCandidates: vi
        .fn()
        .mockResolvedValue(
          labels.map((l) => ({ label: l, aliases: [], recallReason: 'normalized-name' as const })),
        ),
    });

    const result = await recallCandidates(repo, 'test');

    expect(result.candidates.length).toBeLessThanOrEqual(HARD_MAX_CANDIDATES);
  });

  it('does not include merged or disabled labels', async () => {
    const mergedLabel = makeLabel({ id: 'lbl_merged', status: 'merged' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(mergedLabel),
    });

    const result = await recallCandidates(repo, 'test');

    // Merged labels should not be included via findCanonicalByAlias
    // (the function checks status)
    expect(result.candidates).toHaveLength(0);
  });

  it('uses normalized name search when no exact alias match', async () => {
    const nameLabel = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const repo = makeMockRepo({
      searchCandidates: vi.fn().mockResolvedValue([
        {
          label: nameLabel,
          aliases: ['timeout-issue'],
          recallReason: 'normalized-name' as const,
        },
      ]),
    });

    const result = await recallCandidates(repo, 'timeout-issue');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.recallReason).toBe('normalized-name');
    expect(result.recallBreakdown.normalizedNameCount).toBe(1);
  });

  it('skips semantic recall when embeddings provider is not available', async () => {
    const repo = makeMockRepo();
    const result = await recallCandidates(repo, 'test', undefined, undefined);

    expect(result.recallBreakdown.embeddingCount).toBe(0);
    expect(repo.searchCandidatesByEmbedding).not.toHaveBeenCalled();
  });

  it('respects RECOMMENDED_MAX_CANDIDATES default', async () => {
    expect(RECOMMENDED_MAX_CANDIDATES).toBe(5);
    expect(HARD_MAX_CANDIDATES).toBe(8);
  });
});
