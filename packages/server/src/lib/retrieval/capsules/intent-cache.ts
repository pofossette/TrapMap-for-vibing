import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';

import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';

export interface IntentCacheStore {
  get(key: string): ParsedIntent | null;
  set(key: string, intent: ParsedIntent): void;
  clear(): void;
}

export class InMemoryIntentCache implements IntentCacheStore {
  private cache: RetrievalCache<ParsedIntent>;

  constructor(options?: { maxSize?: number; ttlMs?: number }) {
    this.cache = new RetrievalCache<ParsedIntent>({
      maxSize: options?.maxSize ?? 200,
      ttlMs: options?.ttlMs ?? 30 * 60_000,
      namespace: 'intent',
    });
  }

  get(key: string): ParsedIntent | null {
    return this.cache.get(key);
  }

  set(key: string, intent: ParsedIntent): void {
    this.cache.set(key, intent);
  }

  clear(): void {
    this.cache.clear();
  }
}
