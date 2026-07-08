import { normalizeActivityType } from '@trapmap/web-panel/shared/lib/display-labels';
import type { ActivityEventViewModel } from '@trapmap/web-panel/shared/enum-types';

function mapActivityEvent(event: ActivityEventViewModel): ActivityEventViewModel {
  return {
    ...event,
    typeLabel: normalizeActivityType(event.typeLabel),
  };
}

export function mapActivityFeed(events: ActivityEventViewModel[]): ActivityEventViewModel[] {
  return events.map(mapActivityEvent);
}
