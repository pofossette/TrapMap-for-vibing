import type { RecallCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRegistry, type RecallChannel } from './channel-registry.js';

function makeMockChannel(name: string): RecallChannel {
  return {
    name,
    recall: vi.fn(async (): Promise<RecallCandidate[]> => []),
  };
}

describe('ChannelRegistry', () => {
  it('register and get by name', () => {
    const registry = new ChannelRegistry();
    const channel = makeMockChannel('semantic');
    registry.register(channel);
    expect(registry.get('semantic')).toBe(channel);
  });

  it('get returns undefined for unregistered name', () => {
    const registry = new ChannelRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('all() returns all registered channels in insertion order', () => {
    const registry = new ChannelRegistry();
    const semantic = makeMockChannel('semantic');
    const keyword = makeMockChannel('keyword');
    const graph = makeMockChannel('graph');
    registry.register(semantic);
    registry.register(keyword);
    registry.register(graph);
    expect(registry.all()).toEqual([semantic, keyword, graph]);
  });

  it('register throws on duplicate name with message "already registered"', () => {
    const registry = new ChannelRegistry();
    registry.register(makeMockChannel('semantic'));
    expect(() => registry.register(makeMockChannel('semantic'))).toThrowError(/already registered/);
  });
});
