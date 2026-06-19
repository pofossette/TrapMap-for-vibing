import type { ActivityEventViewModel } from '../../shared/types/admin-panel';

export function mapActivityEvent(event: ActivityEventViewModel): ActivityEventViewModel {
  return { ...event };
}

export function mapActivityFeed(events: ActivityEventViewModel[]): ActivityEventViewModel[] {
  return events.map(mapActivityEvent);
}
