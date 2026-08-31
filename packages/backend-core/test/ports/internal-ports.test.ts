import { describe, expectTypeOf, it } from 'vitest';

import type { ConflictRelation, FeedbackRemediationState } from '@trapmap/contracts';

import type {
  GovernanceAsyncCommandPort,
  GovernanceConflictEntry,
  GovernanceConflictReadPort,
  GovernanceConflictWorkflowPort,
  GovernanceRetrievalProjection,
} from '../../src/ports/internal-ports.js';
import type { FeedbackQueueRecord } from '../../src/ports/repo-ports.js';

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

  it('exposes governance-owned async command payloads', () => {
    expectTypeOf<GovernanceAsyncCommandPort['reactivateRemediation']>().parameter(0).toMatchTypeOf<{
      entryId: string;
      feedbackIds: string[];
    }>();
    expectTypeOf<GovernanceAsyncCommandPort['exportBadcaseDraft']>().parameter(0).toMatchTypeOf<{
      feedbackId: string;
      requestId: string | null;
      traceId: string | null;
    }>();
  });
});
