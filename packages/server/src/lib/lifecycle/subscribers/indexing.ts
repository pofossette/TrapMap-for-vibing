import type { LifecycleState } from '@trapmap/contracts';
import {
  createCacheInvalidationEvent,
  emitCacheInvalidation,
} from '@trapmap/server/lib/cache/invalidation.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import { runKnowledgeIndexEvent } from '@trapmap/server/lib/indexing/events.js';
import type { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import { createSharedJobQueuePort, scheduleSharedJob } from '@trapmap/server/lib/jobs/index.js';
import { KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE } from '@trapmap/server/lib/jobs/types.js';
import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';
import { getStorePool, type SkillShareerStore } from '@trapmap/server/lib/store.js';

/**
 * Create an event subscriber that syncs knowledge indexes on lifecycle transitions.
 * Skips self-transitions (previousState === nextState) unless reason is 'updated'
 * (approved entry content changes need index refresh).
 */
export function createIndexingSubscriber(
  store: SkillShareerStore,
  registry: AdapterRegistry,
  graphQueryBackend?: GraphQueryBackend,
  asyncQueue?: Parameters<typeof createSharedJobQueuePort>[0],
): DomainEventHandler {
  const sharedJobQueue = asyncQueue ? createSharedJobQueuePort(asyncQueue) : undefined;
  return async (event) => {
    const previousState = event.previousState as LifecycleState;
    const nextState = event.nextState as LifecycleState;

    // Skip self-transitions (e.g., agent-pass → agent-pass on revision)
    // unless reason is 'updated' (approved entry content refresh)
    if (previousState === nextState && event.reason !== 'updated') return;

    if (!getStorePool(store)) {
      emitCacheInvalidation(
        createCacheInvalidationEvent({
          sourceType: 'trap',
          sourceId: event.entryId,
          reason: nextState === 'deactivated' ? 'deactivated' : 'approved',
          owner: 'knowledge-lifecycle-projection',
          trigger: 'write-through-fallback',
        }),
      );
      const data = await store.snapshot();
      await runKnowledgeIndexEvent({
        services: {
          store,
          data,
          ...(graphQueryBackend !== undefined ? { graphQueryBackend } : {}),
        },
        entryId: event.entryId,
        previousState,
        nextState,
        reason: event.reason,
        registry,
      });
      return;
    }

    emitCacheInvalidation(
      createCacheInvalidationEvent({
        sourceType: 'trap',
        sourceId: event.entryId,
        reason: nextState === 'deactivated' ? 'deactivated' : 'approved',
        owner: 'knowledge-lifecycle-projection',
        trigger: 'outbox-subscriber',
      }),
    );
    await scheduleSharedJob(
      sharedJobQueue,
      store,
      KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
      {
        entryId: event.entryId,
        previousState,
        nextState,
        reason: event.reason,
      },
      `${KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE}:${event.entryId}:${previousState}:${nextState}:${event.reason}`,
    );
  };
}
