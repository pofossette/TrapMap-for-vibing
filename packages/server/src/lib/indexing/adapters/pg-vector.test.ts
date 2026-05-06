import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedIndexDocument } from '../types.js';

// ---------------------------------------------------------------------------
// Mutable mock state — tests set these before each test
// ---------------------------------------------------------------------------

interface MockDb {
  select: ReturnType<typeof makeChain>;
  insert: ReturnType<typeof makeChain>;
  update: ReturnType<typeof makeChain>;
  delete: ReturnType<typeof makeChain>;
}

let currentMockDb: MockDb;

function makeChain(finalResult?: unknown) {
  const chain: Record<string, any> = {};
  const handler: ProxyHandler<typeof chain> = {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return (..._args: unknown[]) => {
        if (prop === 'limit') return Promise.resolve(finalResult ?? []);
        if (prop === 'onConflictDoUpdate') return Promise.resolve(finalResult ?? []);
        return new Proxy(chain, handler);
      };
    },
  };
  return new Proxy(chain, handler);
}

function setMockDb(selectResult?: unknown[]) {
  const selectChain = makeChain(selectResult);
  currentMockDb = {
    select: () => selectChain,
    insert: () => makeChain(),
    update: () => makeChain(),
    delete: () => makeChain(),
  };
}

// ---------------------------------------------------------------------------
// Top-level mocks — these are evaluated once at module load
// ---------------------------------------------------------------------------

const mockGenerateEmbedding = vi.fn<() => Promise<number[]>>();

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: () => currentMockDb,
}));

vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, val: unknown) => ({ _eq: val }),
  and: (...conds: unknown[]) => ({ _and: conds }),
}));

vi.mock('../../embeddings.js', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

// Import after mocks
const { createPgVectorAdapter } = await import('./pg-vector.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocument(overrides: Partial<NormalizedIndexDocument> = {}): NormalizedIndexDocument {
  return {
    entryId: 'entry_1',
    teamId: 'team_1',
    scope: 'project',
    requiredLevel: 5,
    lifecycleState: 'approved',
    revision: 1,
    updatedAt: '2025-01-01T00:00:00Z',
    shortcut: 'Test',
    detail: 'Test detail',
    labels: ['test'],
    canonicalText: 'test content for embedding',
    tokens: ['test', 'content'],
    contentHash: 'abc123hash',
    normalizedAt: '2025-01-01T00:00:00Z',
    boundary: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPgVectorAdapter', () => {
  beforeEach(() => {
    setMockDb([]);
    mockGenerateEmbedding.mockReset();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('returns adapter with kind=vector', () => {
    const adapter = createPgVectorAdapter({ pool: {} as any });
    expect(adapter.kind).toBe('vector');
  });

  describe('sync', () => {
    it('skips when featureFlag returns false', async () => {
      const adapter = createPgVectorAdapter({
        pool: {} as any,
        featureFlag: () => false,
      });

      const result = await adapter.sync(makeDocument());

      expect(result.success).toBe(true);
      expect(result.performedWork).toBe(false);
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });

    it('skips when existing row matches contentHash (idempotent)', async () => {
      setMockDb([{ contentHash: 'abc123hash' }]);

      const adapter = createPgVectorAdapter({ pool: {} as any });
      const result = await adapter.sync(makeDocument({ contentHash: 'abc123hash' }));

      expect(result.success).toBe(true);
      expect(result.performedWork).toBe(false);
    });

    it('generates embedding and upserts when no existing row', async () => {
      setMockDb([]); // no existing row

      const adapter = createPgVectorAdapter({ pool: {} as any });
      const result = await adapter.sync(makeDocument());

      expect(result.success).toBe(true);
      expect(result.performedWork).toBe(true);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('test content for embedding');
      expect(result.payload).toEqual([0.1, 0.2, 0.3]);
    });

    it('generates embedding when contentHash differs', async () => {
      setMockDb([{ contentHash: 'old_hash' }]);

      const adapter = createPgVectorAdapter({ pool: {} as any });
      const result = await adapter.sync(makeDocument({ contentHash: 'new_hash' }));

      expect(result.success).toBe(true);
      expect(result.performedWork).toBe(true);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('test content for embedding');
    });

    it('returns error result on exception', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('embedding service down'));
      setMockDb([]);

      const adapter = createPgVectorAdapter({ pool: {} as any });
      const result = await adapter.sync(makeDocument());

      expect(result.success).toBe(false);
      expect(result.error).toBe('embedding service down');
      expect(result.performedWork).toBe(false);
    });
  });

  describe('remove', () => {
    it('skips when featureFlag returns false', async () => {
      const adapter = createPgVectorAdapter({
        pool: {} as any,
        featureFlag: () => false,
      });

      await expect(
        adapter.remove({ entryId: 'entry_1', revision: 1 }),
      ).resolves.toBeUndefined();
    });

    it('calls delete with correct filters', async () => {
      const adapter = createPgVectorAdapter({ pool: {} as any });

      await expect(
        adapter.remove({ entryId: 'entry_1', revision: 1 }),
      ).resolves.toBeUndefined();
    });

    it('is idempotent - calling remove twice does not error', async () => {
      const adapter = createPgVectorAdapter({ pool: {} as any });

      await adapter.remove({ entryId: 'entry_1', revision: 1 });
      await expect(
        adapter.remove({ entryId: 'entry_1', revision: 1 }),
      ).resolves.toBeUndefined();
    });
  });
});
