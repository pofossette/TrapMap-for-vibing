import { describe, expect, it } from 'vitest';

import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
  GraphQueryBackend,
} from '@trapmap/contracts';
import {
  buildGraphRuntimeSnapshot,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
} from '@trapmap/contracts';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { createMockEntry } from '@trapmap/server/testing/mock-factories.js';
import { graphAssistedRecall } from './graph-assisted.js';

function createMockGraphIndexRepo(docs: GraphIndexDocumentRecord[] = []): GraphQueryBackend {
  const runtime = () => buildGraphRuntimeSnapshot(docs);
  return {
    kind: 'memory',
    isEnabled: () => true,
    getRuntimeState: () => ({ mode: 'enabled-primary', backendKind: 'memory', failOpen: false }),
    healthcheck: async () => ({ ok: true, mode: 'enabled-primary' }),
    upsertDocument: async () => {},
    removeSource: async () => {},
    rebuildProjection: async () => {},
    expandSourcesOneHop: async ({ queryLabels, eligibleSourceIds }) => {
      const sourceIds = expandSourcesOneHop(runtime(), queryLabels);
      return eligibleSourceIds
        ? new Set([...sourceIds].filter((sourceId) => eligibleSourceIds.has(sourceId)))
        : sourceIds;
    },
    calculateSourceRelationStrength: async ({ sourceId, queryLabels }) =>
      calculateSourceRelationStrength(runtime(), sourceId, queryLabels),
    getSourceNodeIds: async () => new Map(),
    buildLocalExpansionView: async () => ({
      graph: {} as never,
      nodeViewsById: new Map(),
      nodeIdsBySourceId: new Map(),
    }),
    findMitigatingSkills: async () => [],
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
  it('returns direct graph matches for query entities', async () => {
    const entry = createMockEntry({
      id: 'entry-1',
      shortcut: 'Docker timeout error',
      detail: 'Container crashes due to memory limit',
      labels: ['docker', 'timeout'],
    });
    const eligibleEntries = new Map([[entry.id, entry]]);

    const graphIndexRepo = createMockGraphIndexRepo([
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

    const candidates = await graphAssistedRecall('docker timeout', eligibleEntries, {
      graphQueryBackend: graphIndexRepo,
    });

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
    const _hiddenEntry = createMockEntry({
      id: 'entry-3',
      shortcut: 'Unauthorized crash fix',
      detail: 'Should not be returned',
      labels: ['crash'],
    });

    const eligibleEntries = new Map<string, KnowledgeRecord>([
      [directEntry.id, directEntry],
      [relatedEntry.id, relatedEntry],
    ]);

    const graphIndexRepo = createMockGraphIndexRepo([
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

    const candidates = await graphAssistedRecall('docker', eligibleEntries, {
      graphQueryBackend: graphIndexRepo,
    });
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

    const graphIndexRepo = createMockGraphIndexRepo([
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

    const candidates = await graphAssistedRecall('docker', eligibleEntries, {
      graphQueryBackend: graphIndexRepo,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.entry.id).toBe('entry-1');
    expect(candidates[0]!.score).toBeGreaterThan(candidates[1]!.score);
  });

  it('returns empty results for empty queries or empty eligible sets', async () => {
    await expect(graphAssistedRecall('', new Map())).resolves.toEqual([]);
    await expect(
      graphAssistedRecall('docker', new Map(), {
        graphQueryBackend: createMockGraphIndexRepo(),
      }),
    ).resolves.toEqual([]);
  });
});
