import type {
  ActorRef,
  KnowledgeEntry,
  LifecycleState,
  ReviewQueueItem,
  ReviewQueueQuery,
  ReviewQueueResponse,
} from '@trapmap/contracts';

import type { ActivityEventViewModel } from './activity.js';

export type ReviewRiskTone = 'danger' | 'neutral' | 'warning';

export type ReviewItemViewModel = {
  assignedReviewer: string | null;
  createdAt: string;
  id: string;
  riskLabel: string;
  riskScore: number;
  riskTone: ReviewRiskTone;
  source: string;
  status: LifecycleState;
  subtitle: string;
  title: string;
};

export type ReviewWarning = {
  kind: 'agent-note' | 'manual-flag' | 'system';
  message: string;
};

// fallow-ignore-next-line unused-type
export type ReviewDecisionKind = 'approve' | 'reject' | 'return-for-correction';

export type ReviewHistoryEntry = {
  actor: string;
  at: string;
  decision: string;
  notes: string;
};

export type ReviewDetailViewModel = {
  activity: ActivityEventViewModel[];
  assignedReviewer: string | null;
  createdAt: string;
  files: ReviewArtifactFile[];
  id: string;
  jsonPayload: string;
  metadata: Array<{ label: string; value: string }>;
  rawEntry: KnowledgeEntry;
  reviewHistory: ReviewHistoryEntry[];
  source: string;
  status: LifecycleState;
  summary: string;
  title: string;
  warnings: ReviewWarning[];
};

export type ReviewQueueFilters = {
  riskLevel: 'all' | 'high' | 'medium' | 'low';
  search: string;
  sort: 'highest-risk' | 'longest-waiting' | 'newest' | 'oldest';
  source: string;
  status: 'all' | LifecycleState;
};

export type ReviewQueuePage = {
  items: ReviewItemViewModel[];
  total: number;
};

export type ReviewQueueRequest = {
  filters: ReviewQueueFilters;
  paging: Pick<ReviewQueueQuery, 'cursor' | 'limit'>;
};

export type ReviewDetailDecisionInput = {
  decision: ReviewDecisionKind;
  notes: string;
};

export type ManualJsonEditInput = {
  filePath?: string;
  payload: unknown;
  rationale: string;
  reviewId: string;
};

export type ReviewArtifactFile = {
  content: string;
  language: 'json' | 'markdown' | 'text' | 'yaml';
  lastEditedAt: string;
  name: string;
  path: string;
  size: number;
};

export type ReviewQueueDto = ReviewQueueResponse;
export type ReviewQueueItemDto = ReviewQueueItem;
export type ActorRefDto = ActorRef;

export type ReviewDetailResponse = {
  activity: ActivityEventViewModel[];
  entry: KnowledgeEntry;
  files: ReviewArtifactFile[];
};
