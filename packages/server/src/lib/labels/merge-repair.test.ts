import { describe, expect, it, vi } from 'vitest';

import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';

import { repairGraphDocuments } from './merge-repair.js';
import type { CanonicalLabelRecord, LabelRepository } from './repository.js';

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

function makeDoc(overrides: Partial<GraphIndexDocumentRecord> = {}): GraphIndexDocumentRecord {
  return {
    id: 'graphdoc_test',
    sourceType: 'trap',
    sourceId: 'k1',
    revision: 1,
    contentHash: 'abc123',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes: [{ id: 'cue:pod-timeout', kind: 'cue', label: 'pod-timeout', evidence: 'test' }],
    edges: [],
    evidence: 'test',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('repairGraphDocuments', () => {
  it('examines all documents', async () => {
    const repo = makeMockRepo();
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const docs = [makeDoc(), makeDoc({ id: 'graphdoc_test2' })];

    const report = await repairGraphDocuments(repo, docs, updateDoc);

    expect(report.examined).toBe(2);
  });

  it('rewrites node IDs when canonical mapping exists', async () => {
    const canonicalLabel = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(canonicalLabel),
    });
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const docs = [makeDoc()];

    const report = await repairGraphDocuments(repo, docs, updateDoc);

    expect(report.nodesRewritten).toBe(1);
    expect(report.updatedDocuments).toBe(1);
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'cue:lbl_timeout',
            canonicalLabelId: 'lbl_timeout',
          }),
        ]),
      }),
    );
  });

  it('rewrites edges when source/target node IDs change', async () => {
    const canonicalLabel = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockImplementation(async (alias: string) => {
        // Only return canonical for pod-timeout, not kubernetes
        if (alias === 'pod-timeout') return canonicalLabel;
        return null;
      }),
    });
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const docs = [
      makeDoc({
        nodes: [
          { id: 'cue:pod-timeout', kind: 'cue', label: 'pod-timeout', evidence: 'test' },
          { id: 'tool:kubernetes', kind: 'tool', label: 'kubernetes', evidence: 'test' },
        ],
        edges: [
          {
            id: 'cue:pod-timeout-co-occurs-with-tool:kubernetes',
            sourceNodeId: 'cue:pod-timeout',
            targetNodeId: 'tool:kubernetes',
            relationType: 'co-occurs-with',
            strength: 'soft',
            evidence: 'test',
          },
        ],
      }),
    ];

    const report = await repairGraphDocuments(repo, docs, updateDoc);

    expect(report.nodesRewritten).toBe(1);
    expect(report.edgesRewritten).toBe(1);
  });

  it('deduplicates nodes that collapse to the same canonical ID', async () => {
    const canonicalLabel = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockImplementation(async (alias: string) => {
        if (alias === 'pod-timeout' || alias === 'timeout-issue') return canonicalLabel;
        return null;
      }),
    });
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const docs = [
      makeDoc({
        nodes: [
          { id: 'cue:pod-timeout', kind: 'cue', label: 'pod-timeout', evidence: 'short' },
          {
            id: 'cue:timeout-issue',
            kind: 'cue',
            label: 'timeout-issue',
            evidence: 'longer evidence',
          },
        ],
      }),
    ];

    await repairGraphDocuments(repo, docs, updateDoc);

    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: 'cue:lbl_timeout' })],
      }),
    );
  });

  it('skips documents with no canonical mappings', async () => {
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(null),
    });
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const docs = [makeDoc()];

    const report = await repairGraphDocuments(repo, docs, updateDoc);

    expect(report.nodesRewritten).toBe(0);
    expect(report.updatedDocuments).toBe(0);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('respects dryRun flag — no writes', async () => {
    const canonicalLabel = makeLabel({ id: 'lbl_timeout', canonicalName: 'timeout-issue' });
    const repo = makeMockRepo({
      findCanonicalByAlias: vi.fn().mockResolvedValue(canonicalLabel),
    });
    const updateDoc = vi.fn().mockResolvedValue(undefined);
    const docs = [makeDoc()];

    const report = await repairGraphDocuments(repo, docs, updateDoc, { dryRun: true });

    expect(report.nodesRewritten).toBe(1);
    expect(report.updatedDocuments).toBe(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('handles empty document list', async () => {
    const repo = makeMockRepo();
    const updateDoc = vi.fn().mockResolvedValue(undefined);

    const report = await repairGraphDocuments(repo, [], updateDoc);

    expect(report.examined).toBe(0);
    expect(report.updatedDocuments).toBe(0);
  });
});
