import type { LifecycleState } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { determineKnowledgeIndexAction, runKnowledgeIndexEvent } from './events.js';
import { graphIndexAdapter } from './adapters/graph.js';
import { AdapterRegistry } from './registry.js';
import type { IndexAdapter, NormalizedIndexDocument } from './types.js';

class MockAdapter implements IndexAdapter {
  constructor(readonly kind: string) {}

  syncCalls: NormalizedIndexDocument[] = [];
  removeCalls: Array<{ entryId: string; revision: number }> = [];

  async sync(document: NormalizedIndexDocument) {
    this.syncCalls.push(document);
    return { adapterKind: this.kind, success: true, error: null, performedWork: true };
  }

  async remove(ref: { entryId: string; revision: number }) {
    this.removeCalls.push(ref);
  }
}

function registryWith(...adapters: IndexAdapter[]) {
  const registry = new AdapterRegistry();
  adapters.forEach((adapter) => registry.register(adapter));
  return registry;
}

function indexingEntry(lifecycleState: LifecycleState, indexState: Record<string, unknown> | null) {
  return {
    id: 'owner-entry',
    teamId: null,
    scope: 'global' as const,
    labels: ['owner'],
    shortcut: 'Owner projection',
    detail: 'Index through the authoritative owner.',
    requiredLevel: 0,
    lifecycleState,
    boundary: null,
    updatedAt: '2026-07-26T00:00:00.000Z',
    revision: 2,
    indexState,
    embeddingCache: null,
  };
}

describe('lifecycle event mapping', () => {
  it.each([
    ['submitted', 'approved', 'upsert'],
    ['approved', 'deactivated', 'remove'],
    ['submitted', 'rejected', 'noop'],
  ] as const)('maps %s to %s as %s', (previousState, nextState, expected) => {
    expect(determineKnowledgeIndexAction(previousState, nextState)).toBe(expected);
  });
});

describe('runKnowledgeIndexEvent', () => {
  it('indexes an approved owner projection and checkpoints owner metadata', async () => {
    const adapter = new MockAdapter('keyword');
    const updateIndexMetadata = vi.fn().mockResolvedValue(undefined);
    const knowledgeOwner = {
      getIndexingEntry: vi.fn().mockResolvedValue(indexingEntry('approved', null)),
      updateIndexMetadata,
    };

    await runKnowledgeIndexEvent({
      services: { store: {} as never, knowledgeOwner },
      entryId: 'owner-entry',
      previousState: 'submitted',
      nextState: 'approved',
      reason: 'reviewer-approved',
      registry: registryWith(adapter),
    });

    expect(adapter.syncCalls).toHaveLength(1);
    expect(updateIndexMetadata).toHaveBeenCalledWith(
      'owner-entry',
      expect.objectContaining({ indexState: expect.any(Object), embeddingCache: null }),
    );
  });

  it('removes a deactivated owner projection from the graph owner', async () => {
    const graphIndex = {
      removeBySource: vi.fn().mockResolvedValue(undefined),
    };
    const knowledgeOwner = {
      getIndexingEntry: vi
        .fn()
        .mockResolvedValue(indexingEntry('deactivated', { adapters: { graph: {} } })),
      updateIndexMetadata: vi.fn().mockResolvedValue(undefined),
    };

    await runKnowledgeIndexEvent({
      services: { store: {} as never, knowledgeOwner, graphIndex: graphIndex as never },
      entryId: 'owner-entry',
      previousState: 'approved',
      nextState: 'deactivated',
      reason: 'admin-deactivate',
      registry: registryWith(graphIndexAdapter),
    });

    expect(graphIndex.removeBySource).toHaveBeenCalledWith('trap', 'owner-entry');
    expect(knowledgeOwner.updateIndexMetadata).toHaveBeenCalledWith('owner-entry', {
      indexState: null,
      embeddingCache: null,
    });
  });

  it('rejects an indexing transition without an owner projection', async () => {
    await expect(
      runKnowledgeIndexEvent({
        services: { store: {} as never },
        entryId: 'owner-entry',
        previousState: 'submitted',
        nextState: 'approved',
        reason: 'reviewer-approved',
        registry: registryWith(),
      }),
    ).rejects.toThrow('Knowledge owner is required for lifecycle indexing');
  });

  it('does not require an owner for a noop transition', async () => {
    await expect(
      runKnowledgeIndexEvent({
        services: { store: {} as never },
        entryId: 'owner-entry',
        previousState: 'submitted',
        nextState: 'rejected',
        reason: 'reviewer-rejected',
        registry: registryWith(),
      }),
    ).resolves.toBeUndefined();
  });
});
