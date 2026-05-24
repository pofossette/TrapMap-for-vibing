import { describe, expect, it, vi } from 'vitest';

import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';

import { InMemoryIntentCache } from './intent-cache.js';

function makeIntent(seed: string): ParsedIntent {
  return {
    seed,
    normalized: seed.toLowerCase(),
    situation: null,
    problem: null,
    goal: null,
    errorText: null,
    tokens: [],
    stackPathHints: [],
    category: null,
    semanticQuery: null,
    parseMethod: 'regex',
  };
}

describe('InMemoryIntentCache', () => {
  it('returns null on cache miss', () => {
    const cache = new InMemoryIntentCache();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns stored value on cache hit', () => {
    const cache = new InMemoryIntentCache();
    const intent = makeIntent('docker deploy fails');

    cache.set('docker deploy fails', intent);
    const result = cache.get('docker deploy fails');

    expect(result).toEqual(intent);
  });

  it('evicts expired entries based on TTL', () => {
    vi.useFakeTimers();
    const cache = new InMemoryIntentCache({ ttlMs: 5000 });
    const intent = makeIntent('docker deploy');

    cache.set('docker deploy', intent);
    expect(cache.get('docker deploy')).toEqual(intent);

    vi.advanceTimersByTime(6000);
    expect(cache.get('docker deploy')).toBeNull();

    vi.useRealTimers();
  });

  it('evicts oldest entry when at capacity', () => {
    const cache = new InMemoryIntentCache({ maxSize: 2 });

    const intent1 = makeIntent('key1');
    const intent2 = makeIntent('key2');
    const intent3 = makeIntent('key3');

    cache.set('key1', intent1);
    cache.set('key2', intent2);
    cache.set('key3', intent3);

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toEqual(intent2);
    expect(cache.get('key3')).toEqual(intent3);
  });

  it('clears all entries', () => {
    const cache = new InMemoryIntentCache();
    cache.set('key1', makeIntent('intent1'));
    cache.set('key2', makeIntent('intent2'));

    expect(cache.get('key1')).not.toBeNull();
    expect(cache.get('key2')).not.toBeNull();

    cache.clear();

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });
});
