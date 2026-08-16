/**
 * Governance assertion layer for retrieval evaluation.
 *
 * Phase 26-01: REVAL-04
 * Phase 78-08: GPEVAL-03 (graph-plan structural assertions)
 * Evaluates governance correctness separately from ranking metrics.
 * Hard-fail assertions for forbidden hits, outcome mismatches, and shape violations.
 */

import type { RetrievalEvalCase } from '../../types/index.js';

import {
  checkForbiddenHits,
  checkUnexpectedEmpty,
  checkUnexpectedNonEmpty,
  checkV1BucketShape,
  checkV1SkillLookupArtifacts,
  checkV2CapsuleCount,
  checkV2ProfileHints,
  checkV3GraphPlanStructure,
} from './governance-shared.js';
import type { GovernanceFailure, GovernanceResult, NormalizedResult } from './types.js';

/**
 * Evaluate governance for a case.
 * Returns all failures found, not just the first.
 */
export function evaluateGovernance(
  case_: RetrievalEvalCase,
  result: NormalizedResult,
): GovernanceResult {
  const failures: GovernanceFailure[] = [];

  const forbiddenFailure = checkForbiddenHits(result, case_.expected.governance.forbiddenIds);
  if (forbiddenFailure) failures.push(forbiddenFailure);

  const emptyFailure = checkUnexpectedEmpty(result, case_.expected.outcome);
  if (emptyFailure) failures.push(emptyFailure);

  const nonEmptyFailure = checkUnexpectedNonEmpty(result, case_.expected.outcome);
  if (nonEmptyFailure) failures.push(nonEmptyFailure);

  if (case_.endpoint === '/v1/retrieval/search') {
    const bucketFailure = checkV1BucketShape(result, case_.expected.shape.bucketExpectations);
    if (bucketFailure) failures.push(bucketFailure);
  }

  if (case_.endpoint === '/v1/retrieval/skills/search-by-content') {
    const artifactFailure = checkV1SkillLookupArtifacts(
      result,
      case_.expected.shape.expectedArtifactIds,
    );
    if (artifactFailure) failures.push(artifactFailure);
  }

  if (case_.endpoint === '/v2/retrieval/search') {
    const profileFailure = checkV2ProfileHints(
      result,
      case_.expected.shape.expectedProfileHintArtifactIds,
    );
    if (profileFailure) failures.push(profileFailure);

    const capsuleCountFailure = checkV2CapsuleCount(
      result,
      case_.expected.shape.expectedCapsuleCount,
    );
    if (capsuleCountFailure) failures.push(capsuleCountFailure);
  }

  if (case_.endpoint === '/v3/retrieval/search') {
    const graphPlanFailures = checkV3GraphPlanStructure(
      result,
      case_.expected.shape.graphPlanExpectations,
    );
    failures.push(...graphPlanFailures);
  }

  const returnedSet = new Set(result.returnedIds);
  const forbiddenHits = case_.expected.governance.forbiddenIds.filter((id) => returnedSet.has(id));

  return {
    passed: failures.length === 0,
    failures,
    forbiddenHits,
  };
}
