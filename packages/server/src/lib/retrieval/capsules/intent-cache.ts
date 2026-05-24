import type { ParsedIntent } from '@trapmap/server/lib/retrieval/types.js';

export interface IntentCacheStore {
  get(key: string): ParsedIntent | null;
  set(key: string, intent: ParsedIntent): void;
  clear(): void;
}

export class InMemoryIntentCache implements IntentCacheStore {
  private store = new Map<string, { intent: ParsedIntent; createdAt: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(options?: { maxSize?: number; ttlMs?: number }) {
    this.maxSize = options?.maxSize ?? 200;
    this.ttlMs = options?.ttlMs ?? 30 * 60_000;
  }

  get(key: string): ParsedIntent | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.intent;
  }

  set(key: string, intent: ParsedIntent): void {
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { intent, createdAt: Date.now() });
  }

  clear(): void {
    this.store.clear();
  }
}
