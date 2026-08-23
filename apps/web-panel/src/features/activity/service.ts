import { mapActivityFeed } from '@trapmap/web-panel/services/mappers/activity-event-mapper';
import type {
  ActivityFeedPage,
  ActivityFeedQuery,
  AdminPanelApiContract,
} from '@trapmap/web-panel/shared/enum-types';

export async function loadActivityFeed(
  api: AdminPanelApiContract,
  query?: ActivityFeedQuery,
): Promise<ActivityFeedPage> {
  const response = await api.loadActivityFeed(query);
  return {
    events: mapActivityFeed(response.events),
    filteredTotal: response.filteredTotal,
    nextCursor: response.nextCursor,
    total: response.total,
  };
}
