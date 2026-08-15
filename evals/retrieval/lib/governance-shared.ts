import type { GraphPlanExpectations } from '@trapmap/contracts/evals';

import type { GovernanceFailure, NormalizedResult } from './types.js';

export function checkForbiddenHits(
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

export function checkUnexpectedEmpty(
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

export function checkUnexpectedNonEmpty(
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

export function checkV1BucketShape(
  result: NormalizedResult,
  bucketExpectations?: Record<'globalConstraints' | 'projectKnowledge', string[]>,
): GovernanceFailure | null {
  if (!bucketExpectations) return null;

  const missingIds: string[] = [];
  const expectedGlobal = bucketExpectations.globalConstraints ?? [];
  const actualGlobalSet = new Set(result.buckets.globalConstraints);
  for (const expectedId of expectedGlobal) {
    if (!actualGlobalSet.has(expectedId)) {
      missingIds.push(expectedId);
    }
  }

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

export function checkV1SkillLookupArtifacts(
  result: NormalizedResult,
  expectedArtifactIds?: string[],
): GovernanceFailure | null {
  if (!expectedArtifactIds || expectedArtifactIds.length === 0) {
    return null;
  }

  const actualSet = new Set(result.artifactIds);
  const missingIds = expectedArtifactIds.filter((id) => !actualSet.has(id));

  if (missingIds.length > 0) {
    return {
      kind: 'shape-mismatch',
      description: `Expected artifact IDs missing from skill lookup response: ${missingIds.join(', ')}`,
      ids: missingIds,
    };
  }

  return null;
}

export function checkV2ProfileHints(
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

export function checkV2CapsuleCount(
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

export function checkV3GraphPlanStructure(
  result: NormalizedResult,
  graphPlanExpectations?: GraphPlanExpectations,
): GovernanceFailure[] {
  if (!graphPlanExpectations) return [];

  const failures: GovernanceFailure[] = [];
  const structure = result.graphPlanStructure;

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

  for (const expectedId of graphPlanExpectations.expectedTrapNodeIds) {
    if (!structure.trapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected trap node ${expectedId} not found in graph`,
        ids: [expectedId],
      });
    }
  }

  for (const expectedId of graphPlanExpectations.expectedSkillNodeIds) {
    if (!structure.skillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected skill node ${expectedId} not found in graph`,
        ids: [expectedId],
      });
    }
  }

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

  for (const expectedId of graphPlanExpectations.expectedBlockingTrapNodeIds) {
    if (!structure.blockingTrapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'graph-plan-mismatch',
        description: `Expected blocking trap ${expectedId} not in focus`,
        ids: [expectedId],
      });
    }
  }

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
