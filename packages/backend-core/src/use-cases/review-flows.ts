/**
 * Review flow use-case patterns.
 *
 * Defines the host-agnostic orchestration patterns for
 * governance/review workflows. These describe the shape of
 * review operations without prescribing infrastructure details.
 */

import type { LifecycleState } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Review decision
// ---------------------------------------------------------------------------

export type ReviewDecision = 'approve' | 'reject';

export interface ReviewDecisionInput {
  entryId: string;
  decision: ReviewDecision;
  actorId: string;
  note?: string;
}

export interface ReviewDecisionResult {
  entryId: string;
  previousState: LifecycleState;
  newState: LifecycleState;
  decision: ReviewDecision;
  actorId: string;
  decidedAt: string;
}

// ---------------------------------------------------------------------------
// Review queue query
// ---------------------------------------------------------------------------

export interface ReviewQueueQuery {
  teamId?: string;
  status?: LifecycleState;
  limit?: number;
  offset?: number;
}

export interface ReviewQueueItem {
  entryId: string;
  title: string;
  submittedBy: string;
  submittedAt: string;
  labels: string[];
  lifecycleState: LifecycleState;
}

export interface ReviewQueueResult {
  items: ReviewQueueItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Review orchestration contract
// ---------------------------------------------------------------------------

/**
 * The shape of a review flow orchestrator.
 * Bounded-context modules implement this to provide review capabilities.
 */
export interface ReviewFlowOrchestrator {
  /**
   * Apply a review decision to a knowledge entry.
   */
  applyDecision(input: ReviewDecisionInput): Promise<ReviewDecisionResult>;

  /**
   * Query the review queue for entries awaiting review.
   */
  queryQueue(query: ReviewQueueQuery): Promise<ReviewQueueResult>;
}
