import { describe, expect, it, vi } from 'vitest';
import { AdapterRegistry } from './registry.js';
import type { IndexAdapter, IndexSyncResult, NormalizedIndexDocument } from './types.js';

function createMockAdapter(kind: string): IndexAdapter {
  return {
    kind,
    sync: vi.fn<() => Promise<IndexSyncResult>>().mockResolvedValue({
      adapterKind: kind,
      success: true,
      error: null,
      performedWork: true,
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AdapterRegistry', () => {
  it('registers and retrieves adapters by kind', () => {
    const registry = new AdapterRegistry();
    const adapter = createMockAdapter('vector');
    registry.register(adapter);
    expect(registry.get('vector')).toBe(adapter);
  });

  it('get returns undefined for unregistered kind', () => {
    const registry = new AdapterRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('all() returns all registered adapters in insertion order', () => {
    const registry = new AdapterRegistry();
    const vector = createMockAdapter('vector');
    const keyword = createMockAdapter('keyword');
    const graph = createMockAdapter('graph');
    registry.register(vector);
    registry.register(keyword);
    registry.register(graph);
    expect(registry.all()).toEqual([vector, keyword, graph]);
  });

  it('kinds() returns all kind strings in insertion order', () => {
    const registry = new AdapterRegistry();
    registry.register(createMockAdapter('vector'));
    registry.register(createMockAdapter('keyword'));
    registry.register(createMockAdapter('graph'));
    expect(registry.kinds()).toEqual(['vector', 'keyword', 'graph']);
  });

  it('has() returns true for registered kind', () => {
    const registry = new AdapterRegistry();
    registry.register(createMockAdapter('vector'));
    expect(registry.has('vector')).toBe(true);
  });

  it('has() returns false for unregistered kind', () => {
    const registry = new AdapterRegistry();
    expect(registry.has('vector')).toBe(false);
  });

  it('throws on duplicate kind registration', () => {
    const registry = new AdapterRegistry();
    registry.register(createMockAdapter('vector'));
    expect(() => registry.register(createMockAdapter('vector'))).toThrow(
      "Adapter 'vector' is already registered",
    );
  });

  it('works with custom string kinds', () => {
    const registry = new AdapterRegistry();
    const fulltext = createMockAdapter('fulltext');
    registry.register(fulltext);
    expect(registry.get('fulltext')).toBe(fulltext);
    expect(registry.kinds()).toEqual(['fulltext']);
  });
});
