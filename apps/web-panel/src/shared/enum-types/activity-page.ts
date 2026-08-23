import type { ActivityEventViewModel } from './activity.js';

export type ActivityFeedPage = {
  events: ActivityEventViewModel[];
  filteredTotal: number;
  nextCursor: string | null;
  total: number;
};
