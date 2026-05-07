import type { LifecycleState } from '@trapmap/contracts';
import { runKnowledgeIndexEvent } from '../../indexing/events.js';
import type { AdapterRegistry } from '../../indexing/registry.js';
import type { SkillShareerStore } from '../../store.js';
import type { DomainEventHandler } from '../types.js';

/**
 * Create an event subscriber that syncs knowledge indexes on lifecycle transitions.
 * Skips self-transitions (previousState === nextState) unless reason is 'updated'
 * (approved entry content changes need index refresh).
 */
export function createIndexingSubscriber(
  store: SkillShareerStore,
  registry: AdapterRegistry,
): DomainEventHandler {
  return async (event) => {
    const previousState = event.previousState as LifecycleState;
    const nextState = event.nextState as LifecycleState;

    // Skip self-transitions (e.g., agent-pass → agent-pass on revision)
    // unless reason is 'updated' (approved entry content refresh)
    if (previousState === nextState && event.reason !== 'updated') return;

    const data = await store.snapshot();
    await runKnowledgeIndexEvent({
      services: { store, data },
      entryId: event.entryId,
      previousState,
      nextState,
      reason: event.reason,
      registry,
    });
  };
}
