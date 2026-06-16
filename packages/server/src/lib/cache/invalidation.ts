export type CacheInvalidationReason =
  | 'approved'
  | 'deactivated'
  | 'remediation-suppressed'
  | 'remediation-reactivated';

export type CacheInvalidationOwner =
  | 'knowledge-lifecycle-projection'
  | 'skill-lifecycle-projection'
  | 'feedback-remediation-projection';

export type CacheInvalidationTrigger =
  | 'outbox-subscriber'
  | 'shared-job'
  | 'write-through-fallback'
  | 'operator-request';

export interface CacheInvalidationEvent {
  sourceType: 'trap' | 'skill';
  sourceId: string;
  reason: CacheInvalidationReason;
  owner: CacheInvalidationOwner;
  trigger: CacheInvalidationTrigger;
  freshness: {
    semantics: 'eventual-consistency';
    note: 'Write may succeed before retrieval/operator projections observe the refresh.';
  };
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

export function createCacheInvalidationEvent(args: {
  sourceType: CacheInvalidationEvent['sourceType'];
  sourceId: string;
  reason: CacheInvalidationReason;
  owner: CacheInvalidationOwner;
  trigger: CacheInvalidationTrigger;
}): CacheInvalidationEvent {
  return {
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    reason: args.reason,
    owner: args.owner,
    trigger: args.trigger,
    freshness: {
      semantics: 'eventual-consistency',
      note: 'Write may succeed before retrieval/operator projections observe the refresh.',
    },
  };
}

export function clearCacheInvalidationListeners(): void {
  listeners.clear();
}
