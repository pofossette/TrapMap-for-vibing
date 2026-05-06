import type { LifecycleState } from '@trapmap/contracts';
import type { IndexAdapter } from '../../indexing/types.js';
import { runKnowledgeIndexEvent } from '../../indexing/events.js';
import type { SkillShareerStore } from '../../store.js';
import type { DomainEventHandler } from '../types.js';

/**
 * Create an event subscriber that syncs knowledge indexes on lifecycle transitions.
 * Skips self-transitions (previousState === nextState).
 */
export function createIndexingSubscriber(
  store: SkillShareerStore,
  adapters: IndexAdapter[],
): DomainEventHandler {
  return async (event) => {
    const previousState = event.previousState as LifecycleState;
    const nextState = event.nextState as LifecycleState;

    // Skip self-transitions (e.g., agent-pass → agent-pass on revision)
    if (previousState === nextState) return;

    const data = await store.snapshot();
    await runKnowledgeIndexEvent({
      services: { store, data },
      entryId: event.entryId,
      previousState,
      nextState,
      reason: event.reason,
      adapters,
    });
  };
}
