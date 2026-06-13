import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';
import { registerCacheInvalidationListener } from '@trapmap/server/lib/cache/invalidation.js';

import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';

export interface IntentCacheStore {
  get(key: string): ParsedIntent | null;
  set(key: string, intent: ParsedIntent): void;
  clear(): void;
}

export class InMemoryIntentCache implements IntentCacheStore {
  private cache: RetrievalCache<ParsedIntent>;
  private unregister: (() => void) | null = null;

  constructor(options?: { maxSize?: number; ttlMs?: number }) {
    this.cache = new RetrievalCache<ParsedIntent>({
      maxSize: options?.maxSize ?? 200,
      ttlMs: options?.ttlMs ?? 30 * 60_000,
      namespace: 'intent',
    });
    this.unregister = registerCacheInvalidationListener({
      invalidate: () => {
        this.cache.clear();
      },
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

  deleteByPrefix(prefix: string): number {
    return this.cache.deleteByPrefix(prefix);
  }

  dispose(): void {
    this.unregister?.();
    this.unregister = null;
  }
}
