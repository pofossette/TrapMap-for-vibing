import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';

/**
 * Create an event subscriber that logs lifecycle transitions for audit trail.
 * This subscriber provides supplementary post-commit logging.
 */
export function createAuditSubscriber(log: {
  info: (obj: Record<string, unknown>, msg: string) => void;
}): DomainEventHandler {
  return (event) => {
    log.info(
      { event: { ...event } },
      `Lifecycle audit: ${event.name} (${event.previousState} → ${event.nextState})`,
    );
  };
}
