/**
 * Governance assertion layer for retrieval evaluation.
 *
 * Phase 26-01: REVAL-04
 * Phase 78-08: GPEVAL-03 (graph-plan structural assertions)
 * Evaluates governance correctness separately from ranking metrics.
 * Hard-fail assertions for forbidden hits, outcome mismatches, and shape violations.
 */

import type { GraphPlanExpectations, RetrievalEvalCase } from '@trapmap/contracts/evals';
import type { BucketMap, GovernanceFailure, GovernanceResult, NormalizedResult } from './types.js';

// =============================================================================
// Governance Checks
// =============================================================================

/**
 * Check for forbidden hits in results.
 */
function checkForbiddenHits(
  result: NormalizedResult,
  forbiddenIds: string[],
): GovernanceFailure | null {
  const returnedSet = new Set(result.returnedIds);
  const forbiddenHits = forbiddenIds.filter((id) => returnedSet.has(id));

  if (forbiddenHits.length > 0) {
    return {
      kind: 'forbidden-hit',
      description: `Forbidden IDs found in results: ${forbiddenHits.join(', ')}`,
      ids: forbiddenHits,
    };
  }

  return null;
}

/**
 * Check for unexpected empty result.
 */
function checkUnexpectedEmpty(
  result: NormalizedResult,
  expectedOutcome: 'empty' | 'non-empty',
): GovernanceFailure | null {
  if (expectedOutcome === 'non-empty' && result.isEmpty) {
    return {
      kind: 'unexpected-empty',
      description: 'Expected non-empty results but got empty',
      ids: [],
    };
  }

  return null;
}

/**
 * Check for unexpected non-empty result.
 */
function checkUnexpectedNonEmpty(
  result: NormalizedResult,
  expectedOutcome: 'empty' | 'non-empty',
): GovernanceFailure | null {
  if (expectedOutcome === 'empty' && !result.isEmpty) {
    return {
      kind: 'unexpected-non-empty',
      description: 'Expected empty results but got non-empty',
      ids: result.returnedIds,
    };
  }

  return null;
}

/**
 * Check v1 bucket shape expectations.
 */
function checkV1BucketShape(
  result: NormalizedResult,
  bucketExpectations?: Record<'globalConstraints' | 'projectKnowledge', string[]>,
): GovernanceFailure | null {
  if (!bucketExpectations) return null;

  const missingIds: string[] = [];

  // Check global constraints
  const expectedGlobal = bucketExpectations.globalConstraints ?? [];
  const actualGlobalSet = new Set(result.buckets.globalConstraints);
  for (const expectedId of expectedGlobal) {
    if (!actualGlobalSet.has(expectedId)) {
      missingIds.push(expectedId);
    }
  }

  // Check project knowledge
  const expectedProject = bucketExpectations.projectKnowledge ?? [];
  const actualProjectSet = new Set(result.buckets.projectKnowledge);
  for (const expectedId of expectedProject) {
    if (!actualProjectSet.has(expectedId)) {
      missingIds.push(expectedId);
    }
  }

  if (missingIds.length > 0) {
    return {
      kind: 'shape-mismatch',
      description: `Expected IDs missing from buckets: ${missingIds.join(', ')}`,
      ids: missingIds,
    };
  }

  return null;
}

/**
 * Check v2 profile hints expectations.
 */
function checkV2ProfileHints(
  result: NormalizedResult,
  expectedProfileHintArtifactIds?: string[],
): GovernanceFailure | null {
  if (!expectedProfileHintArtifactIds || expectedProfileHintArtifactIds.length === 0) {
    return null;
  }

  const actualSet = new Set(result.profileHintArtifactIds);
  const missingIds = expectedProfileHintArtifactIds.filter((id) => !actualSet.has(id));

  if (missingIds.length > 0) {
    return {
      kind: 'shape-mismatch',
      description: `Expected profile hint artifact IDs missing: ${missingIds.join(', ')}`,
      ids: missingIds,
    };
  }

  return null;
}

/**
 * Check v2 capsule count expectations.
 */
function checkV2CapsuleCount(
  result: NormalizedResult,
  expectedCapsuleCount?: number,
): GovernanceFailure | null {
  if (expectedCapsuleCount === undefined) return null;

  const actualCount = result.hits.length;
  if (actualCount !== expectedCapsuleCount) {
    return {
      kind: 'shape-mismatch',
      description: `Expected ${expectedCapsuleCount} capsules but got ${actualCount}`,
      ids: [],
    };
  }

  return null;
}

/**
 * Check v3 graph-plan structural expectations.
 * Phase 78-08: GPEVAL-03
 */
function checkV3GraphPlanStructure(
  result: NormalizedResult,
  graphPlanExpectations?: GraphPlanExpectations,
): GovernanceFailure[] {
  if (!graphPlanExpectations) return [];

  const failures: GovernanceFailure[] = [];
  const structure = result.graphPlanStructure;

  // Handle missing structure when expectations exist
  if (!structure) {
    if (
      graphPlanExpectations.expectedTrapNodeIds.length > 0 ||
      graphPlanExpectations.expectedSkillNodeIds.length > 0
    ) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: 'Expected graph-plan structure but response had none (fallback or v1/v2)',
        ids: [
          ...graphPlanExpectations.expectedTrapNodeIds,
          ...graphPlanExpectations.expectedSkillNodeIds,
        ],
      });
    }
    return failures;
  }

  // Check trap nodes
  for (const expectedId of graphPlanExpectations.expectedTrapNodeIds) {
    if (!structure.trapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected trap node ${expectedId} not found in graph`,
        ids: [expectedId],
      });
    }
  }

  // Check skill nodes
  for (const expectedId of graphPlanExpectations.expectedSkillNodeIds) {
    if (!structure.skillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected skill node ${expectedId} not found in graph`,
        ids: [expectedId],
      });
    }
  }

  // Check edges
  for (const expectedEdge of graphPlanExpectations.expectedEdges) {
    const found = structure.edges.some(
      (e) =>
        e.sourceNodeId === expectedEdge.sourceNodeId &&
        e.targetNodeId === expectedEdge.targetNodeId &&
        e.type === expectedEdge.type,
    );
    if (!found) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected edge ${expectedEdge.sourceNodeId} -> ${expectedEdge.targetNodeId} (${expectedEdge.type}) not found`,
        ids: [`${expectedEdge.sourceNodeId}->${expectedEdge.targetNodeId}`],
      });
    }
  }

  // Check blocking trap node IDs
  for (const expectedId of graphPlanExpectations.expectedBlockingTrapNodeIds) {
    if (!structure.blockingTrapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected blocking trap ${expectedId} not in focus`,
        ids: [expectedId],
      });
    }
  }

  // Check recommended skill node IDs
  for (const expectedId of graphPlanExpectations.expectedRecommendedSkillNodeIds) {
    if (!structure.recommendedSkillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected recommended skill ${expectedId} not in focus`,
        ids: [expectedId],
      });
    }
  }

  return failures;
}

// =============================================================================
// Main Governance Evaluation
// =============================================================================

/**
 * Evaluate governance for a case.
 * Returns all failures found, not just the first.
 */
export function evaluateGovernance(
  case_: RetrievalEvalCase,
  result: NormalizedResult,
): GovernanceResult {
  const failures: GovernanceFailure[] = [];

  // Check forbidden hits
  const forbiddenFailure = checkForbiddenHits(result, case_.expected.governance.forbiddenIds);
  if (forbiddenFailure) failures.push(forbiddenFailure);

  // Check outcome expectation
  const emptyFailure = checkUnexpectedEmpty(result, case_.expected.outcome);
  if (emptyFailure) failures.push(emptyFailure);

  const nonEmptyFailure = checkUnexpectedNonEmpty(result, case_.expected.outcome);
  if (nonEmptyFailure) failures.push(nonEmptyFailure);

  // Check endpoint-specific shape expectations
  if (case_.endpoint === '/v1/retrieval/search') {
    const bucketFailure = checkV1BucketShape(result, case_.expected.shape.bucketExpectations);
    if (bucketFailure) failures.push(bucketFailure);
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

  // Check v3 graph-plan shape expectations (Phase 78-08: GPEVAL-03)
  if (case_.endpoint === '/v3/retrieval/search') {
    const graphPlanFailures = checkV3GraphPlanStructure(
      result,
      case_.expected.shape.graphPlanExpectations,
    );
    failures.push(...graphPlanFailures);
  }

  // Get all forbidden hits for reporting
  const returnedSet = new Set(result.returnedIds);
  const forbiddenHits = case_.expected.governance.forbiddenIds.filter((id) => returnedSet.has(id));

  return {
    passed: failures.length === 0,
    failures,
    forbiddenHits,
  };
}
