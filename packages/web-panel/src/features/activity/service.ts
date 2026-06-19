import { mapActivityFeed } from '../../services/mappers/activity-event-mapper';
import type {
  ActivityEventViewModel,
  ActivityFeedQuery,
  AdminPanelApiContract,
} from '../../shared/types/admin-panel';

export async function loadActivityFeed(
  api: AdminPanelApiContract,
  query?: ActivityFeedQuery,
): Promise<ActivityEventViewModel[]> {
  const response = await api.loadActivityFeed(query);
  return mapActivityFeed(response.events);
}
