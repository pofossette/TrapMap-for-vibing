import type { ActivityEventViewModel } from '@trapmap/web-panel/shared/enum-types';
import { normalizeActivityType } from '@trapmap/web-panel/shared/lib/display-labels';

function mapActivityEvent(event: ActivityEventViewModel): ActivityEventViewModel {
  return {
    ...event,
    typeLabel: normalizeActivityType(event.typeLabel),
  };
}

export function mapActivityFeed(events: ActivityEventViewModel[]): ActivityEventViewModel[] {
  return events.map(mapActivityEvent);
}
