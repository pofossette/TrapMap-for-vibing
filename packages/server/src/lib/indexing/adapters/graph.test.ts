import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphIndexRepositoryPort } from '@trapmap/contracts';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { buildTrapGraphDocument } from './graph-builders.js';
import { clearGraphCache, graphIndexAdapter } from './graph.js';

function makeApprovedTrapDoc(
  overrides: Partial<NormalizedIndexDocument> = {},
): NormalizedIndexDocument {
  const defaults = {
    entryId: 'entry-1',
    teamId: 'team-abc',
    scope: 'project' as const,
    requiredLevel: 5,
    lifecycleState: 'approved' as const,
    revision: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    shortcut: 'Docker build timeout due to network proxy misconfiguration',
    detail:
      'When running docker build behind a corporate proxy, the build must configure HTTP_PROXY before pulling base images.',
    labels: ['docker', 'network', 'timeout', 'proxy'],
    tokens: ['docker', 'build', 'timeout', 'network', 'proxy'],
    contentHash: 'abc123',
    normalizedAt: '2026-01-01T00:00:00Z',
    boundary: null,
  };

  const merged = { ...defaults, ...overrides };
  return {
    ...merged,
    canonicalText: `${merged.shortcut}\n${merged.detail}\n${merged.labels.join(' ')}`,
  } as NormalizedIndexDocument;
}

describe('graph-builders: buildTrapGraphDocument', () => {
  it('assembles a candidate graph document without persisting it', () => {
    const doc = makeApprovedTrapDoc();
    const graphDoc = buildTrapGraphDocument({
      normalizedDocument: doc,
      nodes: [],
      edges: [],
    });

    expect(graphDoc.sourceType).toBe('trap');
    expect(graphDoc.sourceId).toBe('entry-1');
    expect(graphDoc.revision).toBe(1);
    expect(graphDoc.teamId).toBe('team-abc');
    expect(graphDoc.scope).toBe('project');
    expect(graphDoc.requiredLevel).toBe(5);
    expect(graphDoc.nodes).toEqual([]);
    expect(graphDoc.edges).toEqual([]);
    expect(graphDoc.contentHash).toBeTruthy();
    expect(graphDoc.id).toBeTruthy();
  });
});

describe('graph index adapter: durable persistence', () => {
  let graphDocuments: Awaited<ReturnType<GraphIndexRepositoryPort['listAll']>>;
  let graphIndex: GraphIndexRepositoryPort;
  const testDocument: NormalizedIndexDocument = {
    entryId: 'test-entry-1',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    revision: 1,
    updatedAt: nowIso(),
    shortcut: 'Docker build timeout',
    detail: 'Use docker cache to fix the timeout issue. Must restart before continuing.',
    labels: ['docker', 'timeout'],
    canonicalText:
      'Docker build timeout\nUse docker cache to fix the timeout issue. Must restart before continuing.\ndocker timeout',
    tokens: ['docker', 'build', 'timeout', 'use', 'cache', 'to', 'fix', 'the', 'issue'],
    contentHash: 'abc123hash',
    normalizedAt: nowIso(),
    boundary: null,
  };

  beforeEach(() => {
    clearGraphCache();
    graphDocuments = [];
    graphIndex = {
      insert: vi.fn(),
      getById: vi.fn(),
      listBySource: vi.fn(),
      listAll: vi.fn(async () => graphDocuments),
      upsert: vi.fn(async (document) => {
        graphDocuments = [
          ...graphDocuments.filter((current) => current.id !== document.id),
          document,
        ];
      }),
      remove: vi.fn(),
      removeBySource: vi.fn(async (sourceType, sourceId) => {
        graphDocuments = graphDocuments.filter(
          (document) => document.sourceType !== sourceType || document.sourceId !== sourceId,
        );
      }),
    };
  });

  it('persists graph document for an approved trap revision', async () => {
    const result = await graphIndexAdapter.sync(
      testDocument,
      undefined,
      undefined,
      undefined,
      undefined,
      graphIndex,
    );

    expect(result).toMatchObject({
      adapterKind: 'graph',
      success: true,
      error: null,
      performedWork: true,
    });

    expect(graphDocuments).toHaveLength(1);
    expect(graphDocuments[0]!.sourceType).toBe('trap');
    expect(graphDocuments[0]!.sourceId).toBe('test-entry-1');
  });

  it('persists through an injected graph owner port without reading the compatibility store', async () => {
    const graphIndex = {
      listAll: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
      removeBySource: vi.fn().mockResolvedValue(undefined),
    };

    const result = await graphIndexAdapter.sync(
      testDocument,
      undefined,
      undefined,
      undefined,
      undefined,
      graphIndex as never,
    );

    expect(result.success).toBe(true);
    expect(graphIndex.listAll).toHaveBeenCalledOnce();
    expect(graphIndex.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'trap', sourceId: testDocument.entryId }),
    );
  });

  it('stores an empty trap graph when no LLM extraction is available', async () => {
    const result = await graphIndexAdapter.sync(
      testDocument,
      undefined,
      undefined,
      undefined,
      undefined,
      graphIndex,
    );
    expect(result.success).toBe(true);

    const graphDoc = graphDocuments[0];
    expect(graphDoc?.nodes).toEqual([]);
    expect(graphDoc?.edges).toEqual([]);
  });

  it('is idempotent when revision and contentHash match', async () => {
    const result1 = await graphIndexAdapter.sync(
      testDocument,
      undefined,
      undefined,
      undefined,
      undefined,
      graphIndex,
    );
    expect(result1.performedWork).toBe(true);

    const result2 = await graphIndexAdapter.sync(
      testDocument,
      undefined,
      undefined,
      undefined,
      undefined,
      graphIndex,
    );
    expect(result2.performedWork).toBe(false);
    expect(result2.success).toBe(true);
  });

  it('removes graph document from durable store', async () => {
    await graphIndexAdapter.sync(
      testDocument,
      undefined,
      undefined,
      undefined,
      undefined,
      graphIndex,
    );

    expect(graphDocuments.length).toBeGreaterThan(0);

    await graphIndexAdapter.remove(
      {
        entryId: testDocument.entryId,
        revision: testDocument.revision,
      },
      undefined,
      undefined,
      graphIndex,
    );

    expect(graphDocuments).toEqual([]);
  });
});
