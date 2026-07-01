import type { ActivityEventViewModel } from '@trapmap/web-panel/shared/enum-types';

function mapActivityEvent(event: ActivityEventViewModel): ActivityEventViewModel {
  return { ...event };
}

export function mapActivityFeed(events: ActivityEventViewModel[]): ActivityEventViewModel[] {
  return events.map(mapActivityEvent);
}
