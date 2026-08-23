import { normalizeActivityType } from '@trapmap/web-panel/shared/lib/display-labels';
import type {
  ActivityEventViewModel,
  ActivityFeedQuery,
} from '@trapmap/web-panel/shared/enum-types';

type ActivityFeedPage = {
  events: ActivityEventViewModel[];
  filteredTotal: number;
  nextCursor: string | null;
  total: number;
};

function matchesActor(event: ActivityEventViewModel, actor?: string): boolean {
  const normalizedActor = actor?.trim().toLowerCase() ?? '';
  return normalizedActor.length === 0 || event.actor.toLowerCase().includes(normalizedActor);
}

function matchesSearch(event: ActivityEventViewModel, search?: string): boolean {
  const normalizedSearch = search?.trim().toLowerCase() ?? '';
  if (normalizedSearch.length === 0) return true;

  return [event.title, event.actor, event.description].some((value) =>
    value.toLowerCase().includes(normalizedSearch),
  );
}

function matchesTimeRange(event: ActivityEventViewModel, query: ActivityFeedQuery): boolean {
  if (query.from && event.timestamp < query.from) return false;
  if (query.to && event.timestamp > query.to) return false;
  return true;
}

export function applyActivityFeedQuery(
  events: readonly ActivityEventViewModel[],
  query: Partial<ActivityFeedQuery> = {},
): ActivityFeedPage {
  const filtered = events.filter((event) => {
    if (!matchesActor(event, query?.actor)) return false;
    if (query?.type && normalizeActivityType(event.typeLabel) !== query.type) return false;
    return matchesSearch(event, query.search) && matchesTimeRange(event, query);
  });

  const sorted = [...filtered].sort(
    (left, right) =>
      right.timestamp.localeCompare(left.timestamp) || left.id.localeCompare(right.id),
  );
  const limit = query?.limit ?? 20;
  let offset = 0;
  if (query?.cursor) {
    if (!/^[0-9]{1,128}$/.test(query.cursor)) {
      throw new Error('Invalid activity feed cursor');
    }
    offset = Number.parseInt(query.cursor, 10);
  }

  return {
    events: sorted.slice(offset, offset + limit),
    filteredTotal: sorted.length,
    nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
    total: events.length,
  };
}
