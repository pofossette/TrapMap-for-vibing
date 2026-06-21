import { mapActivityFeed } from '@trapmap/web-panel/services/mappers/activity-event-mapper';
import type {
  ActivityEventViewModel,
  ActivityFeedQuery,
  AdminPanelApiContract,
} from '@trapmap/web-panel/shared/enum-types';

export async function loadActivityFeed(
  api: AdminPanelApiContract,
  query?: ActivityFeedQuery,
): Promise<ActivityEventViewModel[]> {
  const response = await api.loadActivityFeed(query);
  return mapActivityFeed(response.events);
}
