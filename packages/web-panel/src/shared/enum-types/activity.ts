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

export type ActivityFeedQuery = {
  actor?: string;
  limit?: number;
  type?: string;
};

export type ActivityFeedResponse = {
  events: ActivityEventViewModel[];
};
