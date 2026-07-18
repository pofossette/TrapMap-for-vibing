import type { JobRuntimePort } from '@trapmap/backend-core';
import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';

/**
 * Create an event subscriber that schedules governance conflict detection after approval.
 * Only triggers when nextState is 'approved'.
 */
export function createConflictSubscriber(
  jobRuntime: Pick<JobRuntimePort, 'schedule'>,
): DomainEventHandler {
  return async (event) => {
    if (event.nextState !== 'approved') return;

    const sourceEventId =
      typeof event.metadata?.sourceEventId === 'string'
        ? event.metadata.sourceEventId
        : `${event.name}:${event.entryId}:${event.timestamp}`;
    await jobRuntime.schedule(
      'governance.conflict-detection',
      { entryId: event.entryId, sourceEventId },
      {
        dedupeKey: `governance.conflict-detection:${event.entryId}:${sourceEventId}`,
      },
    );
  };
}
