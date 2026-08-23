export type ActivityEventTone = 'danger' | 'success' | 'warning';

export type ActivityEventViewModel = {
  actor: string;
  description: string;
  id: string;
  relatedReviewId: string | null;
  timestamp: string;
  title: string;
  tone: ActivityEventTone;
  typeLabel: string;
};

export type ActivityEventTypeFilter = 'decision' | 'intervention' | 'system-ingestion';

export type ActivityFeedFilters = {
  actor: string;
  from: string;
  search: string;
  to: string;
  type: 'all' | ActivityEventTypeFilter;
};

export type ActivityFeedQuery = {
  actor?: string;
  cursor?: string;
  from?: string;
  limit?: number;
  search?: string;
  to?: string;
  type?: string;
};

export type ActivityFeedResponse = {
  events: ActivityEventViewModel[];
  filteredTotal: number;
  nextCursor: string | null;
  total: number;
};
