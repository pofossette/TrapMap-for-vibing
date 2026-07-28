import { describe, expect, it, vi } from 'vitest';

import type { GraphQueryBackend } from './backend.js';
import { createFailOpenGraphQueryBackend } from './health.js';

function createBackend(
  overrides: Partial<GraphQueryBackend> & Pick<GraphQueryBackend, 'kind'>,
): GraphQueryBackend {
  return {
    kind: overrides.kind,
    isEnabled: overrides.isEnabled ?? (() => overrides.kind !== 'memory'),
    getRuntimeState:
      overrides.getRuntimeState ??
      (() => ({
        mode: overrides.kind === 'memory' ? ('disabled' as const) : ('enabled-primary' as const),
        backendKind: overrides.kind,
        failOpen: false,
      })),
    healthcheck:
      overrides.healthcheck ??
      (async () => ({
        ok: true,
        mode: overrides.kind === 'memory' ? ('disabled' as const) : ('enabled-primary' as const),
      })),
    upsertDocument: overrides.upsertDocument ?? (async () => {}),
    removeSource: overrides.removeSource ?? (async () => {}),
    rebuildProjection: overrides.rebuildProjection ?? (async () => {}),
    expandSourcesOneHop: overrides.expandSourcesOneHop ?? (async () => new Set<string>()),
    calculateSourceRelationStrength: overrides.calculateSourceRelationStrength ?? (async () => 0),
    getSourceNodeIds: overrides.getSourceNodeIds ?? (async () => new Map<string, Set<string>>()),
    buildLocalExpansionView:
      overrides.buildLocalExpansionView ??
      (async () => {
        throw new Error('not implemented');
      }),
    findMitigatingSkills: overrides.findMitigatingSkills ?? (async () => []),
  };
}

describe('FailOpenGraphQueryBackend', () => {
  it('reports enabled-fallback health when the primary backend is unhealthy and fail-open is enabled', async () => {
    const primary = createBackend({
      kind: 'neo4j',
      healthcheck: vi.fn().mockResolvedValue({
        ok: false,
        mode: 'enabled-primary',
        detail: 'neo4j unavailable',
      }),
    });
    const fallback = createBackend({ kind: 'memory' });
    const backend = createFailOpenGraphQueryBackend({
      primary,
      fallback,
      failOpen: true,
    });

    await expect(backend.healthcheck()).resolves.toEqual({
      ok: true,
      mode: 'enabled-fallback',
      detail: 'neo4j unavailable',
    });
    expect(backend.getRuntimeState()).toEqual({
      mode: 'enabled-fallback',
      backendKind: 'neo4j',
      failOpen: true,
      detail: 'neo4j unavailable',
    });
  });

  it('rethrows primary read errors when fail-open is disabled', async () => {
    const primary = createBackend({
      kind: 'neo4j',
      expandSourcesOneHop: vi.fn().mockRejectedValue(new Error('neo4j unavailable')),
    });
    const fallbackExpand = vi.fn().mockResolvedValue(new Set(['entry-1']));
    const fallback = createBackend({
      kind: 'memory',
      expandSourcesOneHop: fallbackExpand,
    });
    const backend = createFailOpenGraphQueryBackend({
      primary,
      fallback,
      failOpen: false,
    });

    await expect(
      backend.expandSourcesOneHop({
        queryLabels: new Set(['docker']),
        eligibleSourceIds: new Set(['entry-1']),
      }),
    ).rejects.toThrow('neo4j unavailable');
    expect(fallbackExpand).not.toHaveBeenCalled();
    expect(backend.getRuntimeState()).toEqual({
      mode: 'enabled-primary',
      backendKind: 'neo4j',
      failOpen: false,
      detail: 'neo4j unavailable',
    });
  });

  it('switches runtime state to enabled-fallback when a primary read fails open', async () => {
    const primary = createBackend({
      kind: 'neo4j',
      expandSourcesOneHop: vi.fn().mockRejectedValue(new Error('neo4j unavailable')),
    });
    const fallback = createBackend({
      kind: 'memory',
      expandSourcesOneHop: vi.fn().mockResolvedValue(new Set(['entry-1'])),
    });
    const backend = createFailOpenGraphQueryBackend({
      primary,
      fallback,
      failOpen: true,
    });

    const result = await backend.expandSourcesOneHop({
      queryLabels: new Set(['docker']),
      eligibleSourceIds: new Set(['entry-1']),
    });

    expect(Array.from(result)).toEqual(['entry-1']);
    expect(backend.getRuntimeState()).toEqual({
      mode: 'enabled-fallback',
      backendKind: 'neo4j',
      failOpen: true,
      detail: 'neo4j unavailable',
    });
  });

  it('returns runtime state to enabled-primary after a later successful primary read', async () => {
    const primaryExpand = vi
      .fn()
      .mockRejectedValueOnce(new Error('neo4j unavailable'))
      .mockResolvedValueOnce(new Set(['entry-2']));
    const primary = createBackend({
      kind: 'neo4j',
      expandSourcesOneHop: primaryExpand,
    });
    const fallback = createBackend({
      kind: 'memory',
      expandSourcesOneHop: vi.fn().mockResolvedValue(new Set(['entry-1'])),
    });
    const backend = createFailOpenGraphQueryBackend({
      primary,
      fallback,
      failOpen: true,
    });

    await backend.expandSourcesOneHop({
      queryLabels: new Set(['docker']),
      eligibleSourceIds: new Set(['entry-1']),
    });

    const recovered = await backend.expandSourcesOneHop({
      queryLabels: new Set(['docker']),
      eligibleSourceIds: new Set(['entry-2']),
    });

    expect(Array.from(recovered)).toEqual(['entry-2']);
    expect(backend.getRuntimeState()).toEqual({
      mode: 'enabled-primary',
      backendKind: 'neo4j',
      failOpen: true,
    });
  });

  it('keeps fallback writes durable and records fallback state when the primary write fails open', async () => {
    const logger = { warn: vi.fn() };
    const primary = createBackend({
      kind: 'neo4j',
      upsertDocument: vi.fn().mockRejectedValue(new Error('neo4j unavailable')),
    });
    const fallbackUpsert = vi.fn().mockResolvedValue(undefined);
    const fallback = createBackend({
      kind: 'memory',
      upsertDocument: fallbackUpsert,
    });
    const backend = createFailOpenGraphQueryBackend({
      primary,
      fallback,
      failOpen: true,
      logger,
    });

    await expect(
      backend.upsertDocument({
        id: 'doc-1',
        sourceType: 'trap',
        sourceId: 'entry-1',
        revision: 1,
        contentHash: 'hash-1',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [],
        edges: [],
        evidence: 'evidence',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
      }),
    ).resolves.toBeUndefined();

    expect(fallbackUpsert).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        graphQueryOperation: 'upsertDocument',
        backendKind: 'neo4j',
        detail: 'neo4j unavailable',
      },
      'Graph query backend fell back to memory mode',
    );
    expect(backend.getRuntimeState()).toEqual({
      mode: 'enabled-fallback',
      backendKind: 'neo4j',
      failOpen: true,
      detail: 'neo4j unavailable',
    });
  });
});
