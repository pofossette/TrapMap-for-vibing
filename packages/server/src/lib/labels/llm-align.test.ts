import { describe, expect, it, vi } from 'vitest';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';

import { alignLabel } from './llm-align.js';
import type { LabelRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockRepo(overrides: Partial<LabelRepository> = {}): LabelRepository {
  return {
    findCanonicalById: vi.fn().mockResolvedValue(null),
    findCanonicalByAlias: vi.fn().mockResolvedValue(null),
    upsertCanonicalLabel: vi.fn().mockResolvedValue({
      id: 'lbl_new',
      kind: 'cue',
      canonicalName: 'new-label',
      normalizedName: 'new-label',
      definition: null,
      status: 'active',
      mergedIntoLabelId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }),
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

function makeMockChat(
  responses: string[] = [],
  options: { configured?: boolean } = {},
): ChatProvider {
  let callIndex = 0;
  return {
    isConfigured: options.configured ?? true,
    invoke: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1] ?? '{}';
      callIndex++;
      return response;
    }),
  } as unknown as ChatProvider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('alignLabel', () => {
  it('returns "unsure" when chat provider is not configured', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([], { configured: false });

    const result = await alignLabel(repo, chat, 'pod-timeout', 'timeout evidence');

    expect(result.decision.decision).toBe('unsure');
    expect(result.llmSuccess).toBe(false);
    expect(repo.recordAlignmentEvent).toHaveBeenCalled();
  });

  it('returns "unsure" when LLM returns invalid JSON', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat(['not valid json']);

    const result = await alignLabel(repo, chat, 'pod-timeout', 'timeout evidence');

    expect(result.decision.decision).toBe('unsure');
    expect(result.llmSuccess).toBe(false);
  });

  it('returns "unsure" when LLM returns invalid decision value', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([
      JSON.stringify({
        decision: 'maybe',
        confidence: 0.5,
        reasoning: 'test',
      }),
    ]);

    const result = await alignLabel(repo, chat, 'test-label', 'evidence');

    expect(result.decision.decision).toBe('unsure');
    expect(result.llmSuccess).toBe(false);
  });

  it('returns "existing" decision when LLM matches a candidate', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([
      JSON.stringify({
        decision: 'existing',
        canonicalLabelId: 'lbl_timeout',
        confidence: 0.9,
        reasoning: 'Direct synonym match',
      }),
    ]);

    const result = await alignLabel(repo, chat, 'pod-timeout', 'timeout evidence');

    expect(result.decision.decision).toBe('existing');
    expect(result.decision.canonicalLabelId).toBe('lbl_timeout');
    expect(result.llmSuccess).toBe(true);
    expect(repo.upsertAlias).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: 'pod-timeout',
        canonicalLabelId: 'lbl_timeout',
        source: 'llm',
      }),
    );
  });

  it('returns "new" decision and creates canonical label', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([
      JSON.stringify({
        decision: 'new',
        canonicalName: 'memory-leak',
        confidence: 0.95,
        reasoning: 'No existing candidate',
      }),
    ]);

    const result = await alignLabel(repo, chat, 'memory-leak', 'memory evidence');

    expect(result.decision.decision).toBe('new');
    expect(repo.upsertCanonicalLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalName: 'memory-leak',
      }),
    );
    expect(repo.upsertAlias).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: 'memory-leak',
        source: 'llm',
      }),
    );
  });

  it('records alignment event with correct source context', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([
      JSON.stringify({
        decision: 'unsure',
        confidence: 0.3,
        reasoning: 'Ambiguous',
      }),
    ]);

    await alignLabel(repo, chat, 'test', 'evidence', undefined, {
      sourceContext: 'backfill',
    });

    expect(repo.recordAlignmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        rawLabel: 'test',
        decision: 'unsure',
        sourceContext: 'backfill',
      }),
    );
  });

  it('strips code fences from LLM response', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([
      '```json\n{"decision": "unsure", "confidence": 0.3, "reasoning": "test"}\n```',
    ]);

    const result = await alignLabel(repo, chat, 'test', 'evidence');

    expect(result.decision.decision).toBe('unsure');
    expect(result.llmSuccess).toBe(true);
  });

  it('uses custom event ID generator when provided', async () => {
    const repo = makeMockRepo();
    const chat = makeMockChat([
      JSON.stringify({
        decision: 'unsure',
        confidence: 0.3,
        reasoning: 'test',
      }),
    ]);

    await alignLabel(repo, chat, 'test', 'evidence', undefined, {
      generateEventId: () => 'custom-event-id',
    });

    expect(repo.recordAlignmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-event-id',
      }),
    );
  });
});
