import type { JobRuntimePort } from '../../ports/internal-ports.js';

export interface GovernanceConflictLifecycleEvent {
  name: string;
  entryId: string;
  nextState: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type GovernanceConflictLifecycleHandler = (
  event: GovernanceConflictLifecycleEvent,
) => Promise<void>;

/**
 * Create a host-agnostic lifecycle handler that schedules governance conflict
 * detection after an entry reaches the approved state.
 */
export function createGovernanceConflictTaskScheduler(
  jobRuntime: Pick<JobRuntimePort, 'schedule'>,
): GovernanceConflictLifecycleHandler {
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
