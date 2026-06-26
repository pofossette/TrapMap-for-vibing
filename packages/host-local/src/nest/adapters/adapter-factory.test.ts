import { describe, expect, it } from 'vitest';

import { createKnowledgeReadAdapter } from './adapter-factory.js';
import type { KnowledgeReadPort } from '@trapmap/backend-core';

function createStubPort(): KnowledgeReadPort {
  return {
    getById: async () => null,
    listMine: async () => [],
    search: async () => ({ results: [] }),
    getProjectionStatus: async () => ({
      phase: 'phase-2-boundary-closed',
      source: 'stub',
      consistency: 'strong',
      freshness: 'current',
      fallback: 'none',
      surfaces: [],
    }),
  };
}

describe('Adapter factory', () => {
  it('should create in-process adapter from a concrete port', () => {
    const stub = createStubPort();
    const adapter = createKnowledgeReadAdapter({
      mode: 'in-process',
      port: stub,
    });

    expect(adapter).toBeDefined();
    expect(adapter.getById).toBeDefined();
    expect(adapter.listMine).toBeDefined();
    expect(adapter.search).toBeDefined();
    expect(adapter.getProjectionStatus).toBeDefined();
  });

  it('should throw if in-process mode has no port', () => {
    expect(() => createKnowledgeReadAdapter({ mode: 'in-process' })).toThrow(
      'In-process adapter requires a concrete KnowledgeReadPort',
    );
  });

  it('should create remote adapter with base URL', () => {
    const adapter = createKnowledgeReadAdapter({
      mode: 'remote',
      remoteBaseUrl: 'http://localhost:4001',
    });

    expect(adapter).toBeDefined();
    expect(adapter.getById).toBeDefined();
    expect(adapter.listMine).toBeDefined();
    expect(adapter.search).toBeDefined();
    expect(adapter.getProjectionStatus).toBeDefined();
  });

  it('should throw if remote mode has no base URL', () => {
    expect(() => createKnowledgeReadAdapter({ mode: 'remote' })).toThrow(
      'Remote adapter requires a remoteBaseUrl',
    );
  });

  it('in-process adapter should delegate to the wrapped port', async () => {
    const stub = createStubPort();
    const adapter = createKnowledgeReadAdapter({
      mode: 'in-process',
      port: stub,
    });

    const result = await adapter.getById('test-id');
    expect(result).toBeNull();

    const entries = await adapter.listMine('user-1');
    expect(entries).toEqual([]);

    const searchResult = await adapter.search({ query: 'test' });
    expect(searchResult.results).toEqual([]);

    const status = await adapter.getProjectionStatus();
    expect(status.phase).toBe('phase-2-boundary-closed');
  });
});
