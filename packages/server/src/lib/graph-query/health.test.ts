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
    calculateSourceRelationStrength:
      overrides.calculateSourceRelationStrength ?? (async () => 0),
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
});
