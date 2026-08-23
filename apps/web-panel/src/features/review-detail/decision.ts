import type { ReviewDecisionRequest } from '@trapmap/contracts';

type PanelReviewDecision = NonNullable<ReviewDecisionRequest['decision']>;

type PrepareReviewDecisionInput = {
  decision: Extract<PanelReviewDecision, 'approve' | 'reject' | 'return-for-correction'>;
  defaultNote?: string;
  rationale: string;
};

export function prepareReviewDecision({
  decision,
  defaultNote,
  rationale,
}: PrepareReviewDecisionInput): Pick<ReviewDecisionRequest, 'decision' | 'notes'> {
  const trimmedRationale = rationale.trim();

  if (decision !== 'approve' && trimmedRationale.length === 0) {
    throw new Error('A rationale is required.');
  }

  return {
    decision,
    notes:
      decision === 'approve' && trimmedRationale.length === 0
        ? (defaultNote ?? trimmedRationale)
        : trimmedRationale,
  };
}
