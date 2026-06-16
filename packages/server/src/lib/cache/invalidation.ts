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

export interface CacheInvalidationEventInput {
  sourceType: CacheInvalidationEvent['sourceType'];
  sourceId: string;
  reason: CacheInvalidationReason;
  owner?: CacheInvalidationOwner;
  trigger?: CacheInvalidationTrigger;
  freshness?: CacheInvalidationEvent['freshness'];
}

export interface CacheFreshnessSnapshot {
  invalidations: number;
  staleRecoveries: number;
  pendingInvalidation: boolean;
  lastInvalidatedAt: string | null;
  lastRecoveredAt: string | null;
  lastEvent: CacheInvalidationEvent | null;
}

export interface CacheInvalidationListener {
  namespaces?: readonly string[];
  invalidate(event: CacheInvalidationEvent): void;
}

const listeners = new Set<CacheInvalidationListener>();
const cacheFreshness = new Map<string, CacheFreshnessSnapshot>();

function getOrCreateFreshness(namespace: string): CacheFreshnessSnapshot {
  const existing = cacheFreshness.get(namespace);
  if (existing) {
    return existing;
  }

  const snapshot: CacheFreshnessSnapshot = {
    invalidations: 0,
    staleRecoveries: 0,
    pendingInvalidation: false,
    lastInvalidatedAt: null,
    lastRecoveredAt: null,
    lastEvent: null,
  };
  cacheFreshness.set(namespace, snapshot);
  return snapshot;
}

function cloneEvent(event: CacheInvalidationEvent): CacheInvalidationEvent {
  return {
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    reason: event.reason,
    owner: event.owner,
    trigger: event.trigger,
    freshness: {
      semantics: event.freshness.semantics,
      note: event.freshness.note,
    },
  };
}

function normalizeCacheInvalidationEvent(
  event: CacheInvalidationEvent | CacheInvalidationEventInput,
): CacheInvalidationEvent {
  return {
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    reason: event.reason,
    owner: event.owner ?? 'knowledge-lifecycle-projection',
    trigger: event.trigger ?? 'operator-request',
    freshness: event.freshness ?? {
      semantics: 'eventual-consistency',
      note: 'Write may succeed before retrieval/operator projections observe the refresh.',
    },
  };
}

export function registerCacheInvalidationListener(listener: CacheInvalidationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitCacheInvalidation(event: CacheInvalidationEvent | CacheInvalidationEventInput): void {
  const normalizedEvent = normalizeCacheInvalidationEvent(event);
  const namespaces = new Set<string>();
  for (const listener of listeners) {
    for (const namespace of listener.namespaces ?? []) {
      namespaces.add(namespace);
    }
  }

  for (const namespace of namespaces) {
    recordCacheInvalidation(namespace, normalizedEvent);
  }

  for (const listener of listeners) {
    listener.invalidate(normalizedEvent);
  }
}

export function createCacheInvalidationEvent(args: {
  sourceType: CacheInvalidationEvent['sourceType'];
  sourceId: string;
  reason: CacheInvalidationReason;
  owner: CacheInvalidationOwner;
  trigger: CacheInvalidationTrigger;
}): CacheInvalidationEvent {
  return normalizeCacheInvalidationEvent(args);
}

export function recordCacheInvalidation(namespace: string, event: CacheInvalidationEvent): void {
  const snapshot = getOrCreateFreshness(namespace);
  snapshot.invalidations += 1;
  snapshot.pendingInvalidation = true;
  snapshot.lastInvalidatedAt = new Date().toISOString();
  snapshot.lastEvent = cloneEvent(event);
}

export function recordCacheStaleRecovery(namespace: string): void {
  const snapshot = getOrCreateFreshness(namespace);
  if (!snapshot.pendingInvalidation) {
    return;
  }

  snapshot.staleRecoveries += 1;
  snapshot.pendingInvalidation = false;
  snapshot.lastRecoveredAt = new Date().toISOString();
}

export function getCacheFreshnessSnapshot(): Record<string, CacheFreshnessSnapshot> {
  return Object.fromEntries(
    [...cacheFreshness.entries()].map(([namespace, snapshot]) => [
      namespace,
      {
        invalidations: snapshot.invalidations,
        staleRecoveries: snapshot.staleRecoveries,
        pendingInvalidation: snapshot.pendingInvalidation,
        lastInvalidatedAt: snapshot.lastInvalidatedAt,
        lastRecoveredAt: snapshot.lastRecoveredAt,
        lastEvent: snapshot.lastEvent ? cloneEvent(snapshot.lastEvent) : null,
      },
    ]),
  );
}

export function clearCacheInvalidationListeners(): void {
  listeners.clear();
}

export function resetCacheFreshnessForTests(): void {
  cacheFreshness.clear();
}
