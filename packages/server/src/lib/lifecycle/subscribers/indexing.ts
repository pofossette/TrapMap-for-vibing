import type { LifecycleState } from '@trapmap/contracts';
import { runKnowledgeIndexEvent } from '@trapmap/server/lib/indexing/events.js';
import type { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

/**
 * Create an event subscriber that syncs knowledge indexes on lifecycle transitions.
 * Skips self-transitions (previousState === nextState) unless reason is 'updated'
 * (approved entry content changes need index refresh).
 */
export function createIndexingSubscriber(
  store: SkillShareerStore,
  registry: AdapterRegistry,
  graphQueryBackend?: GraphQueryBackend,
): DomainEventHandler {
  return async (event) => {
    const previousState = event.previousState as LifecycleState;
    const nextState = event.nextState as LifecycleState;

    // Skip self-transitions (e.g., agent-pass → agent-pass on revision)
    // unless reason is 'updated' (approved entry content refresh)
    if (previousState === nextState && event.reason !== 'updated') return;

    const data = await store.snapshot();
    await runKnowledgeIndexEvent({
      services: { store, data, graphQueryBackend },
      entryId: event.entryId,
      previousState,
      nextState,
      reason: event.reason,
      registry,
    });
  };
}
