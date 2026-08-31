import { describe, expect, it } from 'vitest';

import { prepareReviewDecision } from '../../../src/features/review-detail/decision';

describe('prepareReviewDecision', () => {
  it('sends return-for-correction without rewriting it to rejection', () => {
    expect(
      prepareReviewDecision({
        decision: 'return-for-correction',
        rationale: ' revise the boundary fields ',
      }),
    ).toEqual({
      decision: 'return-for-correction',
      notes: 'revise the boundary fields',
    });
  });

  it('uses the localized default note only for approval', () => {
    expect(
      prepareReviewDecision({ decision: 'approve', rationale: '', defaultNote: 'approved' }),
    ).toEqual({ decision: 'approve', notes: 'approved' });
    expect(() => prepareReviewDecision({ decision: 'reject', rationale: '' })).toThrow(
      'A rationale is required.',
    );
  });
});
