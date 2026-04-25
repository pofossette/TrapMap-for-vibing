import { beforeEach, describe, expect, it } from 'vitest';

import { clearGraphCache, setCachedGraphIndexDocuments } from '../../indexing/adapters/graph.js';
import type { GraphEdgeRecord, GraphIndexDocumentRecord, GraphNodeRecord } from '../../indexing/graph-lite/documents.js';
import type { KnowledgeRecord } from '../../store.js';
import { graphAssistedRecall } from './graph-assisted.js';

function createMockEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: overrides.id || 'entry-1',
    teamId: overrides.teamId || null,
    scope: overrides.scope || 'global',
    labels: overrides.labels || ['test'],
    shortcut: overrides.shortcut || 'Test shortcut',
    detail: overrides.detail || 'Test detail',
    requiredLevel: overrides.requiredLevel ?? 0,
    lifecycleState: overrides.lifecycleState || 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user-1',
      shortcut: overrides.shortcut || 'Test shortcut',
      detail: overrides.detail || 'Test detail',
      labels: overrides.labels || ['test'],
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
    indexState: {
      contentHash: 'hash-1',
      normalizedAt: '2024-01-01T00:00:00Z',
      vector: { status: 'synced', revision: 1, contentHash: 'hash-1', lastSyncedAt: null, lastError: null },
      keyword: { status: 'synced', revision: 1, contentHash: 'hash-1', lastSyncedAt: null, lastError: null },
      graph: { status: 'synced', revision: 1, contentHash: 'hash-1', lastSyncedAt: null, lastError: null },
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDoc(
  id: string,
  sourceId: string,
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
): GraphIndexDocumentRecord {
  return {
    id,
    sourceType: 'trap',
    sourceId,
    revision: 1,
    contentHash: `hash-${id}`,
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes,
    edges,
    evidence: 'test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('graph-assisted recall', () => {
  beforeEach(() => {
    clearGraphCache();
  });

  it('returns direct graph matches for query entities', async () => {
    const entry = createMockEntry({
      id: 'entry-1',
      shortcut: 'Docker timeout error',
      detail: 'Container crashes due to memory limit',
      labels: ['docker', 'timeout'],
    });
    const eligibleEntries = new Map([[entry.id, entry]]);

    setCachedGraphIndexDocuments([
      makeDoc(
        'doc-1',
        'entry-1',
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' },
          { id: 'cue:timeout', kind: 'cue', label: 'timeout', evidence: 'test' },
        ],
        [],
      ),
    ]);

    const candidates = await graphAssistedRecall('docker timeout', eligibleEntries);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.entry.id).toBe('entry-1');
    expect(candidates[0]?.channel).toBe('graph');
    expect(candidates[0]?.score).toBeGreaterThan(0.6);
  });

  it('expands one hop through graphology neighbors but only returns eligible entries', async () => {
    const directEntry = createMockEntry({
      id: 'entry-1',
      shortcut: 'Docker installation guide',
      detail: 'How to install Docker',
      labels: ['docker'],
    });
    const relatedEntry = createMockEntry({
      id: 'entry-2',
      shortcut: 'Container crash fix',
      detail: 'Fix memory limit in containers',
      labels: ['crash'],
    });
    const hiddenEntry = createMockEntry({
      id: 'entry-3',
      shortcut: 'Unauthorized crash fix',
      detail: 'Should not be returned',
      labels: ['crash'],
    });

    const eligibleEntries = new Map<string, KnowledgeRecord>([
      [directEntry.id, directEntry],
      [relatedEntry.id, relatedEntry],
    ]);

    setCachedGraphIndexDocuments([
      makeDoc(
        'doc-1',
        'entry-1',
        [{ id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' }],
        [],
      ),
      makeDoc(
        'doc-2',
        'entry-2',
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' },
          { id: 'cue:crash', kind: 'cue', label: 'crash', evidence: 'test' },
        ],
        [
          {
            id: 'docker->crash',
            sourceNodeId: 'tool:docker',
            targetNodeId: 'cue:crash',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'test',
          },
        ],
      ),
      makeDoc(
        'doc-3',
        'entry-3',
        [{ id: 'cue:crash', kind: 'cue', label: 'crash', evidence: 'test' }],
        [],
      ),
    ]);

    const candidates = await graphAssistedRecall('docker', eligibleEntries);
    const ids = candidates.map((candidate) => candidate.entry.id);

    expect(ids).toContain('entry-1');
    expect(ids).toContain('entry-2');
    expect(ids).not.toContain('entry-3');
  });

  it('keeps direct matches above relation-only matches', async () => {
    const directEntry = createMockEntry({
      id: 'entry-1',
      shortcut: 'Docker crash runbook',
      detail: 'Docker crash fix',
      labels: ['docker', 'crash'],
    });
    const relationOnlyEntry = createMockEntry({
      id: 'entry-2',
      shortcut: 'Container memory guide',
      detail: 'Memory tuning',
      labels: ['memory'],
    });

    const eligibleEntries = new Map<string, KnowledgeRecord>([
      [directEntry.id, directEntry],
      [relationOnlyEntry.id, relationOnlyEntry],
    ]);

    setCachedGraphIndexDocuments([
      makeDoc(
        'doc-1',
        'entry-1',
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' },
          { id: 'cue:crash', kind: 'cue', label: 'crash', evidence: 'test' },
        ],
        [],
      ),
      makeDoc(
        'doc-2',
        'entry-2',
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'graph-only seed' },
          { id: 'mit:memory', kind: 'mitigation', label: 'memory', evidence: 'test' },
        ],
        [
          {
            id: 'docker->memory',
            sourceNodeId: 'tool:docker',
            targetNodeId: 'mit:memory',
            relationType: 'mitigates',
            strength: 'soft',
            evidence: 'test',
          },
        ],
      ),
    ]);

    const candidates = await graphAssistedRecall('docker', eligibleEntries);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.entry.id).toBe('entry-1');
    expect(candidates[0]!.score).toBeGreaterThan(candidates[1]!.score);
  });

  it('returns empty results for empty queries or empty eligible sets', async () => {
    setCachedGraphIndexDocuments([]);

    await expect(graphAssistedRecall('', new Map())).resolves.toEqual([]);
    await expect(
      graphAssistedRecall('docker', new Map(), { dataSnapshot: { graphIndexDocuments: [] } as never }),
    ).resolves.toEqual([]);
  });
});
