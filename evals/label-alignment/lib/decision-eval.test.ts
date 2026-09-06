import type { ChatProvider } from '@trapmap/ai-providers';
import type { LabelRepository } from '@trapmap/service-knowledge-write';
import { describe, expect, it, vi } from 'vitest';
import { runLiveDecisionEvaluation } from './decision-eval.js';

function makeMockRepo(overrides: Partial<LabelRepository> = {}): LabelRepository {
  return {
    findCanonicalById: vi.fn().mockResolvedValue({
      id: 'lbl_timeout',
      kind: 'cue',
      canonicalName: 'timeout-issue',
      normalizedName: 'timeout-issue',
      definition: null,
      status: 'active',
      mergedIntoLabelId: null,
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    }),
    findCanonicalByAlias: vi.fn().mockResolvedValue(null),
    upsertCanonicalLabel: vi.fn(),
    upsertAlias: vi.fn(),
    searchCandidates: vi.fn().mockResolvedValue([]),
    searchCandidatesByEmbedding: vi.fn().mockResolvedValue([]),
    upsertEmbedding: vi.fn(),
    recordAlignmentEvent: vi.fn().mockResolvedValue(undefined),
    mergeCanonicalLabels: vi.fn(),
    listActive: vi.fn().mockResolvedValue([]),
    listAliases: vi.fn().mockResolvedValue([]),
    listAlignmentEvents: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeMockChat(decision: Record<string, unknown>): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: true,
    invoke: vi.fn().mockResolvedValue(JSON.stringify(decision)),
  };
}

describe('runLiveDecisionEvaluation', () => {
  it('normalizes existing decisions using canonicalLabelId lookups', async () => {
    const case_ = {
      schemaVersion: 1 as const,
      caseId: 'timeout-case',
      skillId: 'skill/react-hooks-trap',
      variantId: 'catalog-populated',
      variantGroupId: 'timeout-group',
      tier: 'smoke' as const,
      synonymGroupCount: 1,
      totalRawLabels: 1,
      totalCanonicalLabels: 1,
      catalogSeed: [
        {
          id: 'lbl_timeout',
          canonicalName: 'timeout-issue',
          aliases: ['pod timeout'],
        },
      ],
      embeddingEnabled: false,
      goldenAnnotations: [
        {
          rawLabel: 'pod timeout',
          canonicalLabel: 'timeout-issue',
          groupId: 'g-timeout',
          shouldMerge: true,
        },
      ],
      expectedAlignment: {
        canonicalGroups: [['pod timeout']],
        shouldNotMerge: [],
      },
      tags: [],
    };

    const repo = makeMockRepo();
    const chat = makeMockChat({
      decision: 'existing',
      canonicalLabelId: 'lbl_timeout',
      confidence: 0.93,
      reasoning: 'Existing label match',
    });

    const result = await runLiveDecisionEvaluation(case_, {
      repository: repo,
      chat,
      cleanupCatalog: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.alignmentAccuracy).toBe(1);
    expect(result.passed).toBe(true);
    expect(repo.findCanonicalById).toHaveBeenCalledWith('lbl_timeout');
  });
});
