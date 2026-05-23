import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

/**
 * Create an event subscriber that logs lifecycle transitions for audit trail.
 * Note: Primary audit recording (data.auditEvents push) stays inside store.transact().
 * This subscriber provides supplementary post-commit logging.
 */
export function createAuditSubscriber(
  _store: SkillShareerStore,
  log: { info: (obj: Record<string, unknown>, msg: string) => void },
): DomainEventHandler {
  return (event) => {
    log.info(
      {
        event: event.name,
        entryId: event.entryId,
        previousState: event.previousState,
        nextState: event.nextState,
        actorId: event.actorId,
        reason: event.reason,
        timestamp: event.timestamp,
      },
      `Lifecycle transition: ${event.previousState} → ${event.nextState}`,
    );
  };
}
