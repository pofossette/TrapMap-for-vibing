import { detectConflicts } from '@trapmap/server/lib/conflict/index.js';
import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

/**
 * Create an event subscriber that runs conflict detection after approval.
 * Only triggers when nextState is 'approved'.
 */
export function createConflictSubscriber(store: SkillShareerStore): DomainEventHandler {
  return async (event) => {
    // Only run conflict detection on approval
    if (event.nextState !== 'approved') return;

    const data = await store.snapshot();
    await detectConflicts({
      services: { store, data },
      entryId: event.entryId,
    });
  };
}
