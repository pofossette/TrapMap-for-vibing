import type {
  KnowledgeEntry,
  ReviewDecisionRequest,
  ReviewQueueResponse,
  SkillArtifact,
} from '@trapmap/contracts';

import type { ActivityFeedQuery, ActivityFeedResponse } from './activity.js';
import type { ArtifactListResponse, ArtifactQuery } from './artifact.js';
import type { GraphDataResponse } from './graph.js';
import type { ManualJsonEditInput, ReviewDetailResponse, ReviewQueueRequest } from './review.js';
import type { RuntimeOverviewResponse } from './runtime.js';
import type { AdminPanelSession } from './session.js';

export type AdminPanelApiContract = {
  loadActivityFeed(query?: ActivityFeedQuery): Promise<ActivityFeedResponse>;
  loadReviewDetail(reviewId: string): Promise<ReviewDetailResponse>;
  loadRuntimeOverview(): Promise<RuntimeOverviewResponse>;
  loadSession(): Promise<AdminPanelSession>;
  loadPendingReviews(request?: Partial<ReviewQueueRequest>): Promise<ReviewQueueResponse>;
  saveManualJsonEdit(input: ManualJsonEditInput): Promise<{ savedAt: string }>;
  switchSessionAccount(accountId: string): Promise<AdminPanelSession>;
  submitReviewDecision(input: ReviewDecisionRequest): Promise<{ entry: KnowledgeEntry }>;
  loadArtifacts(query?: ArtifactQuery): Promise<ArtifactListResponse>;
  loadArtifactDetail(id: string): Promise<SkillArtifact>;
  loadTrapGraph(): Promise<GraphDataResponse>;
  loadSkillGraph(
    artifactId: string,
    query?: { mode?: 'derivation' | 'semantic' },
  ): Promise<GraphDataResponse>;
};
