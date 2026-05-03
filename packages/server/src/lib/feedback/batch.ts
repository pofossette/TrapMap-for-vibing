/**
 * Batch processing service for admin feedback management.
 *
 * Provides pure functions for planning and executing batch operations
 * on feedback queue items. Follows patterns from decay/batch.ts.
 */

import type { DecayState, FeedbackBatchAction, FeedbackStatus } from '@trapmap/contracts';

import type { StoreData } from '../store.js';

/**
 * Input for feedback batch operation planning and execution.
 */
export interface FeedbackBatchInput {
  /** IDs of feedback items to process (max 100) */
  feedbackIds: string[];
  /** Action to perform */
  action: FeedbackBatchAction;
  /** ID of the user performing the operation */
  actorId: string;
  /** Notes to add to processed items */
  notes?: string;
  /** Target decay state for 'transition' action */
  targetDecayState?: DecayState;
}

/**
 * Plan item for a single feedback item in a batch operation.
 */
export interface FeedbackBatchPlanItem {
  /** Feedback ID */
  feedbackId: string;
  /** Entry ID this feedback refers to */
  entryId: string;
  /** Entry shortcut for display */
  entryShortcut: string;
  /** Current feedback status */
  currentStatus: FeedbackStatus;
  /** Proposed status after the operation */
  proposedStatus: FeedbackStatus;
  /** Human-readable description of the change */
  changeDescription: string;
  /** Whether this feedback is eligible for the operation */
  eligible: boolean;
  /** Reason for ineligibility (null if eligible) */
  ineligibilityReason: string | null;
  /** Resulting decay state for 'transition' action */
  resultingDecayState: DecayState | null;
}

/**
 * Get the entry shortcut for a feedback item.
 */
function getEntryShortcut(data: StoreData, entryId: string): string {
  const trap = data.knowledgeEntries.find((e) => e.id === entryId);
  if (trap) return trap.shortcut;

  const skill = data.skillArtifacts.find((a) => a.id === entryId);
  if (skill) return skill.slug;

  return '[deleted]';
}

/**
 * Determine the proposed status for an action.
 */
function getProposedStatus(
  action: FeedbackBatchAction,
  currentStatus: FeedbackStatus,
): FeedbackStatus | null {
  // Resolved and dismissed are terminal states
  if (currentStatus === 'resolved' || currentStatus === 'dismissed') {
    return null;
  }

  switch (action) {
    case 'resolve':
      return 'resolved';
    case 'dismiss':
      return 'dismissed';
    case 'triage':
      return 'triaged';
    case 'transition':
      // Transition also resolves the feedback
      return 'resolved';
    default:
      return null;
  }
}

/**
 * Plan a feedback batch operation without executing it.
 */
export function planFeedbackBatch(
  data: StoreData,
  input: FeedbackBatchInput,
  now: Date,
): FeedbackBatchPlanItem[] {
  const results: FeedbackBatchPlanItem[] = [];

  for (const feedbackId of input.feedbackIds) {
    const feedback = data.feedbackQueue.find((f) => f.id === feedbackId);

    // Feedback not found
    if (!feedback) {
      results.push({
        feedbackId,
        entryId: '',
        entryShortcut: '',
        currentStatus: 'new',
        proposedStatus: 'new',
        changeDescription: '',
        eligible: false,
        ineligibilityReason: 'Feedback not found',
        resultingDecayState: null,
      });
      continue;
    }

    const entryShortcut = getEntryShortcut(data, feedback.entryId);
    const proposedStatus = getProposedStatus(input.action, feedback.status);

    // Terminal state check
    if (proposedStatus === null) {
      results.push({
        feedbackId,
        entryId: feedback.entryId,
        entryShortcut,
        currentStatus: feedback.status,
        proposedStatus: feedback.status,
        changeDescription: '',
        eligible: false,
        ineligibilityReason: `Feedback already ${feedback.status}`,
        resultingDecayState: null,
      });
      continue;
    }

    // For transition action, validate targetDecayState
    if (input.action === 'transition') {
      if (!input.targetDecayState) {
        results.push({
          feedbackId,
          entryId: feedback.entryId,
          entryShortcut,
          currentStatus: feedback.status,
          proposedStatus,
          changeDescription: '',
          eligible: false,
          ineligibilityReason: 'targetDecayState required for transition action',
          resultingDecayState: null,
        });
        continue;
      }
    }

    // Build change description
    let changeDescription = `Status: ${feedback.status} → ${proposedStatus}`;
    let resultingDecayState: DecayState | null = null;

    if (input.action === 'transition' && input.targetDecayState) {
      changeDescription += `, decay state → ${input.targetDecayState}`;
      resultingDecayState = input.targetDecayState;
    }

    results.push({
      feedbackId,
      entryId: feedback.entryId,
      entryShortcut,
      currentStatus: feedback.status,
      proposedStatus,
      changeDescription,
      eligible: true,
      ineligibilityReason: null,
      resultingDecayState,
    });
  }

  return results;
}
