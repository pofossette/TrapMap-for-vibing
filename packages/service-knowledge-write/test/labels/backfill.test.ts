import { describe, expect, it, vi } from 'vitest';

import { backfillLabels } from '../../src/labels/backfill.js';
import type { CanonicalLabelRecord, LabelRepository } from '../../src/labels/repository.js';

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

describe('backfillLabels', () => {
  it('examines all raw label sources', async () => {
    const repo = makeMockRepo();
    const report = await backfillLabels(
      repo,
      [
        { label: 'timeout-issue', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' },
        { label: 'docker', kind: 'tool', sourceType: 'knowledge', sourceId: 'k2' },
      ],
      { chat: null },
    );

    expect(report.examined).toBe(2);
  });

  it('skips labels that already exist as aliases', async () => {
    const existingLabel = makeLabel({ id: 'lbl_existing' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(existingLabel),
    });

    const report = await backfillLabels(
      repo,
      [{ label: 'existing-label', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' }],
      { chat: null },
    );

    expect(report.skipped).toBe(1);
    expect(report.canonicalCreated).toBe(0);
  });

  it('creates canonical labels when no chat provider', async () => {
    const repo = makeMockRepo();
    const report = await backfillLabels(
      repo,
      [
        { label: 'new-label-1', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' },
        { label: 'new-label-2', kind: 'tool', sourceType: 'knowledge', sourceId: 'k2' },
      ],
      { chat: null },
    );

    expect(report.canonicalCreated).toBe(2);
    expect(report.aliasesCreated).toBe(2);
    expect(repo.upsertCanonicalLabel).toHaveBeenCalledTimes(2);
    expect(repo.upsertAlias).toHaveBeenCalledTimes(2);
  });

  it('deduplicates labels by normalized form', async () => {
    const repo = makeMockRepo();
    const report = await backfillLabels(
      repo,
      [
        { label: 'timeout-issue', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' },
        { label: 'Timeout-Issue', kind: 'cue', sourceType: 'artifact', sourceId: 'a1' },
      ],
      { chat: null },
    );

    // Only one unique label after dedup
    expect(report.examined).toBe(1);
    expect(report.canonicalCreated).toBe(1);
  });

  it('respects dryRun flag — no writes', async () => {
    const repo = makeMockRepo();
    const report = await backfillLabels(
      repo,
      [{ label: 'new-label', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' }],
      { chat: null, dryRun: true },
    );

    expect(report.canonicalCreated).toBe(1);
    expect(repo.upsertCanonicalLabel).not.toHaveBeenCalled();
    expect(repo.upsertAlias).not.toHaveBeenCalled();
  });

  it('adds alias when normalized name matches existing canonical', async () => {
    const existingLabel = makeLabel({
      id: 'lbl_timeout',
      normalizedName: 'timeout-issue',
    });
    const repo = makeMockRepo({
      searchCandidates: vi
        .fn()
        .mockResolvedValue([
          { label: existingLabel, aliases: [], recallReason: 'normalized-name' as const },
        ]),
    });

    const report = await backfillLabels(
      repo,
      [{ label: 'timeout issue', kind: 'cue', sourceType: 'knowledge', sourceId: 'k1' }],
      { chat: null },
    );

    expect(report.matchedExisting).toBe(1);
    expect(report.aliasesCreated).toBe(1);
  });
});
