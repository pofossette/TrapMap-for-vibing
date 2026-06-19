import type {
  ActorRef,
  KnowledgeEntry,
  LifecycleState,
  ReviewDecisionRequest,
  ReviewQueueItem,
  ReviewQueueQuery,
  ReviewQueueResponse,
} from '@trapmap/contracts';

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export type RuntimeServiceHealth = 'healthy' | 'degraded' | 'failed';

export type RuntimeServiceStatus = {
  detail: string;
  lastCheckedAt: string;
  name: string;
  status: RuntimeServiceHealth;
  version: string;
};

export type RuntimeQueueMetric = {
  label: string;
  value: number;
};

export type RuntimeOverview = {
  buildId: string;
  deploymentProfile: string;
  failedJobsCount: number;
  incidents: string[];
  lastHealthCheckAt: string;
  pendingReviewCount: number;
  throughputPerHour: number;
  services: RuntimeServiceStatus[];
  workload: RuntimeQueueMetric[];
};

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

export type SessionUserRole = 'administrator' | 'reviewer' | 'read-only-operator';

export type SessionUser = {
  displayName: string;
  handle: string;
  role: SessionUserRole;
};

export type SessionAccount = {
  id: string;
  token: string;
  user: SessionUser;
};

export type AdminPanelSession = {
  accounts: SessionAccount[];
  authenticated: boolean;
  activeAccountId: string | null;
  availableRoles: SessionUserRole[];
  token: string | null;
  user: SessionUser | null;
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

export type ActivityFeedQuery = {
  actor?: string;
  limit?: number;
  type?: string;
};

export type RuntimeOverviewResponse = {
  buildId: string;
  deploymentProfile: string;
  failedJobsCount: number;
  incidents: string[];
  lastHealthCheckAt: string;
  pendingReviewCount: number;
  services: RuntimeServiceStatus[];
  throughputPerHour: number;
  workload: RuntimeQueueMetric[];
};

export type ReviewDetailResponse = {
  activity: ActivityEventViewModel[];
  entry: KnowledgeEntry;
  files: ReviewArtifactFile[];
};

export type ActivityFeedResponse = {
  events: ActivityEventViewModel[];
};

export type AdminPanelApiContract = {
  loadActivityFeed(query?: ActivityFeedQuery): Promise<ActivityFeedResponse>;
  loadReviewDetail(reviewId: string): Promise<ReviewDetailResponse>;
  loadRuntimeOverview(): Promise<RuntimeOverviewResponse>;
  loadSession(): Promise<AdminPanelSession>;
  loadPendingReviews(request?: Partial<ReviewQueueRequest>): Promise<ReviewQueueResponse>;
  saveManualJsonEdit(input: ManualJsonEditInput): Promise<{ savedAt: string }>;
  switchSessionAccount(accountId: string): Promise<AdminPanelSession>;
  submitReviewDecision(input: ReviewDecisionRequest): Promise<{ entry: KnowledgeEntry }>;
};

export type ReviewQueueDto = ReviewQueueResponse;
export type ReviewQueueItemDto = ReviewQueueItem;
export type ActorRefDto = ActorRef;
