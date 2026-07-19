import { describe, expectTypeOf, it } from 'vitest';

import type { ConflictRelation, FeedbackRemediationState } from '@trapmap/contracts';

import type {
  GovernanceConflictEntry,
  GovernanceConflictReadPort,
  GovernanceConflictWorkflowPort,
  GovernanceRetrievalProjection,
} from './internal-ports.js';
import type { FeedbackQueueRecord } from './repo-ports.js';

describe('governance owner ports', () => {
  it('exposes conflict workflow and read projection contracts', () => {
    type DetectionResult = Awaited<ReturnType<GovernanceConflictWorkflowPort['detectConflicts']>>;
    type CandidateResult = Awaited<
      ReturnType<GovernanceConflictReadPort['getApprovedConflictCandidates']>
    >;

    expectTypeOf<DetectionResult>().toEqualTypeOf<{ detectedCount: number }>();
    expectTypeOf<CandidateResult>().toEqualTypeOf<{
      entry: GovernanceConflictEntry;
      candidates: GovernanceConflictEntry[];
    } | null>();
    expectTypeOf<GovernanceRetrievalProjection['listFeedback']>().returns.resolves.toEqualTypeOf<
      FeedbackQueueRecord[]
    >();
    expectTypeOf<GovernanceRetrievalProjection['listConflicts']>().returns.resolves.toEqualTypeOf<
      ConflictRelation[]
    >();
    expectTypeOf<GovernanceRetrievalProjection['listRemediation']>().returns.resolves.toEqualTypeOf<
      Array<{ entryId: string; remediation: FeedbackRemediationState }>
    >();
  });
});
