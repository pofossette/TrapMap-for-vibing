export interface CacheInvalidationEvent {
  sourceType: 'trap' | 'skill';
  sourceId: string;
  reason: 'approved' | 'deactivated' | 'remediation-suppressed' | 'remediation-reactivated';
}

export interface CacheInvalidationListener {
  invalidate(event: CacheInvalidationEvent): void;
}

const listeners = new Set<CacheInvalidationListener>();

export function registerCacheInvalidationListener(listener: CacheInvalidationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitCacheInvalidation(event: CacheInvalidationEvent): void {
  for (const listener of listeners) {
    listener.invalidate(event);
  }
}

export function clearCacheInvalidationListeners(): void {
  listeners.clear();
}
