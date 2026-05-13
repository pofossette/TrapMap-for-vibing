/**
 * Governance and expectation assertion layer for retrieval evaluation.
 *
 * Phase 26-02: REVAL-04
 * Evaluates governance correctness as first-class verdicts, separate from ranking metrics.
 *
 * Key design:
 * - Verdicts are explicit pass/fail records with detailed failure information
 * - Governance verdicts are computed independently from ranking metrics
 * - Adapter warnings are elevated to verdict-level visibility
 */

import type { GraphPlanExpectations, RetrievalEvalCase } from '@trapmap/contracts/evals';
import type {
  AdapterWarning,
  GovernanceFailure,
  GovernanceResult,
  GraphPlanStructure,
  NormalizedResult,
} from './types.js';

// =============================================================================
// Verdict Types
// =============================================================================

/**
 * Kinds of verdicts that can be issued for a case.
 */
export type VerdictKind = 'governance' | 'outcome' | 'shape' | 'execution';

/**
 * A single verdict for a case.
 * Each verdict is a pass/fail decision with optional failure details.
 */
export interface Verdict {
  /** Kind of verdict */
  kind: VerdictKind;
  /** Whether this verdict passed */
  passed: boolean;
  /** Failure details, if not passed */
  failure?: GovernanceFailure;
}

/**
 * Complete verdict set for a case.
 * A case passes only if all verdicts pass.
 */
export interface CaseVerdicts {
  /** Case ID for reference */
  caseId: string;
  /** All verdicts issued for this case */
  verdicts: Verdict[];
  /** Whether all verdicts passed */
  passed: boolean;
  /** Governance-specific result (separate from metrics) */
  governance: GovernanceResult;
  /** Outcome expectation result */
  outcome: { expected: 'empty' | 'non-empty'; actual: 'empty' | 'non-empty'; matched: boolean };
  /** Execution warnings elevated to verdict visibility */
  warnings: AdapterWarning[];
}

// =============================================================================
// Assertion Functions
// =============================================================================

/**
 * Assert no forbidden hits in results.
 */
function assertNoForbiddenHits(result: NormalizedResult, forbiddenIds: string[]): Verdict {
  const returnedSet = new Set(result.returnedIds);
  const forbiddenHits = forbiddenIds.filter((id) => returnedSet.has(id));

  if (forbiddenHits.length > 0) {
    return {
      kind: 'governance',
      passed: false,
      failure: {
        kind: 'forbidden-hit',
        description: `Forbidden IDs found in results: ${forbiddenHits.join(', ')}`,
        ids: forbiddenHits,
      },
    };
  }

  return { kind: 'governance', passed: true };
}

/**
 * Assert expected outcome matches actual outcome.
 */
function assertOutcomeMatch(
  result: NormalizedResult,
  expectedOutcome: 'empty' | 'non-empty',
): Verdict {
  const actualOutcome = result.isEmpty ? 'empty' : 'non-empty';

  if (expectedOutcome !== actualOutcome) {
    const failure: GovernanceFailure =
      expectedOutcome === 'empty'
        ? {
            kind: 'unexpected-non-empty',
            description: 'Expected empty results but got non-empty',
            ids: result.returnedIds,
          }
        : {
            kind: 'unexpected-empty',
            description: 'Expected non-empty results but got empty',
            ids: [],
          };

    return { kind: 'outcome', passed: false, failure };
  }

  return { kind: 'outcome', passed: true };
}

/**
 * Assert v1 bucket shape expectations.
 */
function assertV1BucketShape(
  result: NormalizedResult,
  bucketExpectations?: Record<'globalConstraints' | 'projectKnowledge', string[]>,
): Verdict | null {
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
      kind: 'shape',
      passed: false,
      failure: {
        kind: 'shape-mismatch',
        description: `Expected IDs missing from buckets: ${missingIds.join(', ')}`,
        ids: missingIds,
      },
    };
  }

  return { kind: 'shape', passed: true };
}

/**
 * Assert v2 profile hints expectations.
 */
function assertV2ProfileHints(
  result: NormalizedResult,
  expectedProfileHintArtifactIds?: string[],
): Verdict | null {
  if (!expectedProfileHintArtifactIds || expectedProfileHintArtifactIds.length === 0) {
    return null;
  }

  const actualSet = new Set(result.profileHintArtifactIds);
  const missingIds = expectedProfileHintArtifactIds.filter((id) => !actualSet.has(id));

  if (missingIds.length > 0) {
    return {
      kind: 'shape',
      passed: false,
      failure: {
        kind: 'shape-mismatch',
        description: `Expected profile hint artifact IDs missing: ${missingIds.join(', ')}`,
        ids: missingIds,
      },
    };
  }

  return { kind: 'shape', passed: true };
}

/**
 * Assert v2 capsule count expectations.
 */
function assertV2CapsuleCount(
  result: NormalizedResult,
  expectedCapsuleCount?: number,
): Verdict | null {
  if (expectedCapsuleCount === undefined) return null;

  const actualCount = result.hits.length;
  if (actualCount !== expectedCapsuleCount) {
    return {
      kind: 'shape',
      passed: false,
      failure: {
        kind: 'shape-mismatch',
        description: `Expected ${expectedCapsuleCount} capsules but got ${actualCount}`,
        ids: [],
      },
    };
  }

  return { kind: 'shape', passed: true };
}

/**
 * Assert execution completed without errors.
 */
function assertExecutionSuccess(warnings: AdapterWarning[]): Verdict | null {
  const degradedWarnings = warnings.filter((w) => w.degraded);

  if (degradedWarnings.length > 0) {
    return {
      kind: 'execution',
      passed: false,
      failure: {
        kind: 'shape-mismatch', // Reusing existing kind
        description: `Execution degraded: ${degradedWarnings.map((w) => w.message).join('; ')}`,
        ids: [],
      },
    };
  }

  // Execution verdict passes even with non-degraded warnings
  return null;
}

// =============================================================================
// Graph-Plan Structural Assertions
// =============================================================================

/**
 * Graph-plan structural assertion result.
 */
export interface GraphPlanAssertionResult {
  passed: boolean;
  failures: GraphPlanFailure[];
}

export interface GraphPlanFailure {
  kind:
    | 'missing-trap-node'
    | 'missing-skill-node'
    | 'missing-edge'
    | 'missing-blocking-trap'
    | 'missing-recommended-skill'
    | 'unexpected-empty-graph';
  description: string;
  expected: string[];
  actual: string[];
}

/**
 * Assert graph-plan structure matches expectations.
 * Checks trap nodes, skill nodes, edges, blocking traps, and recommended skills.
 */
export function assertGraphPlanStructure(
  structure: GraphPlanStructure | undefined,
  expectations: GraphPlanExpectations,
): GraphPlanAssertionResult {
  const failures: GraphPlanFailure[] = [];

  // Skip if no graph-plan structure (v1/v2 or fallback)
  if (!structure) {
    if (
      expectations.expectedTrapNodeIds.length > 0 ||
      expectations.expectedSkillNodeIds.length > 0
    ) {
      failures.push({
        kind: 'unexpected-empty-graph',
        description: 'Expected graph-plan structure but response had none',
        expected: [...expectations.expectedTrapNodeIds, ...expectations.expectedSkillNodeIds],
        actual: [],
      });
    }
    return { passed: failures.length === 0, failures };
  }

  // Check trap nodes
  for (const expectedId of expectations.expectedTrapNodeIds) {
    if (!structure.trapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-trap-node',
        description: `Expected trap node ${expectedId} not found`,
        expected: [expectedId],
        actual: structure.trapNodeIds,
      });
    }
  }

  // Check skill nodes
  for (const expectedId of expectations.expectedSkillNodeIds) {
    if (!structure.skillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-skill-node',
        description: `Expected skill node ${expectedId} not found`,
        expected: [expectedId],
        actual: structure.skillNodeIds,
      });
    }
  }

  // Check edges
  for (const expectedEdge of expectations.expectedEdges) {
    const found = structure.edges.some(
      (e) =>
        e.sourceNodeId === expectedEdge.sourceNodeId &&
        e.targetNodeId === expectedEdge.targetNodeId &&
        e.type === expectedEdge.type,
    );
    if (!found) {
      failures.push({
        kind: 'missing-edge',
        description: `Expected edge ${expectedEdge.sourceNodeId} -> ${expectedEdge.targetNodeId} (${expectedEdge.type}) not found`,
        expected: [
          `${expectedEdge.sourceNodeId}->${expectedEdge.targetNodeId}:${expectedEdge.type}`,
        ],
        actual: structure.edges.map((e) => `${e.sourceNodeId}->${e.targetNodeId}:${e.type}`),
      });
    }
  }

  // Check blocking traps
  for (const expectedId of expectations.expectedBlockingTrapNodeIds) {
    if (!structure.blockingTrapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-blocking-trap',
        description: `Expected blocking trap ${expectedId} not in focus`,
        expected: [expectedId],
        actual: structure.blockingTrapNodeIds,
      });
    }
  }

  // Check recommended skills
  for (const expectedId of expectations.expectedRecommendedSkillNodeIds) {
    if (!structure.recommendedSkillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-recommended-skill',
        description: `Expected recommended skill ${expectedId} not in focus`,
        expected: [expectedId],
        actual: structure.recommendedSkillNodeIds,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

// =============================================================================
// Main Verdict Evaluation
// =============================================================================

/**
 * Evaluate all verdicts for a case.
 * Returns a complete verdict set with governance separate from metrics.
 *
 * @param case_ - The evaluation case
 * @param result - Normalized execution result
 * @param warnings - Adapter warnings from execution
 * @returns Complete verdict set for the case
 */
export function evaluateVerdicts(
  case_: RetrievalEvalCase,
  result: NormalizedResult,
  warnings: AdapterWarning[],
): CaseVerdicts {
  const verdicts: Verdict[] = [];

  // 1. Governance verdict: forbidden hits
  const forbiddenVerdict = assertNoForbiddenHits(result, case_.expected.governance.forbiddenIds);
  verdicts.push(forbiddenVerdict);

  // 2. Outcome verdict: empty/non-empty match
  const outcomeVerdict = assertOutcomeMatch(result, case_.expected.outcome);
  verdicts.push(outcomeVerdict);

  // 3. Shape verdicts: endpoint-specific
  if (case_.endpoint === '/v1/retrieval/search') {
    const bucketVerdict = assertV1BucketShape(result, case_.expected.shape.bucketExpectations);
    if (bucketVerdict) verdicts.push(bucketVerdict);
  }

  if (case_.endpoint === '/v2/retrieval/search') {
    const profileVerdict = assertV2ProfileHints(
      result,
      case_.expected.shape.expectedProfileHintArtifactIds,
    );
    if (profileVerdict) verdicts.push(profileVerdict);

    const capsuleVerdict = assertV2CapsuleCount(result, case_.expected.shape.expectedCapsuleCount);
    if (capsuleVerdict) verdicts.push(capsuleVerdict);
  }

  // 3c. Graph-plan structural verdict (v3 only)
  if (case_.endpoint === '/v3/retrieval/search' && case_.expected.shape.graphPlanExpectations) {
    const graphPlanResult = assertGraphPlanStructure(
      result.graphPlanStructure,
      case_.expected.shape.graphPlanExpectations,
    );
    if (!graphPlanResult.passed) {
      const descriptions = graphPlanResult.failures
        .map((f) => `[${f.kind}] ${f.description}`)
        .join('; ');
      verdicts.push({
        kind: 'shape',
        passed: false,
        failure: {
          kind: 'shape-mismatch',
          description: `Graph-plan structural assertion failed: ${descriptions}`,
          ids: graphPlanResult.failures.flatMap((f) => f.expected),
        },
      });
    }
  }

  // 4. Execution verdict: degraded operation
  const executionVerdict = assertExecutionSuccess(warnings);
  if (executionVerdict) verdicts.push(executionVerdict);

  // Collect failures for governance result
  const failures: GovernanceFailure[] = verdicts
    .filter((v): v is typeof v & { failure: GovernanceFailure } => !v.passed && !!v.failure)
    .map((v) => v.failure);

  // Get forbidden hits for reporting
  const returnedSet = new Set(result.returnedIds);
  const forbiddenHits = case_.expected.governance.forbiddenIds.filter((id) => returnedSet.has(id));

  // Build governance result (compatible with existing governance.ts)
  const governance: GovernanceResult = {
    passed: failures.length === 0,
    failures,
    forbiddenHits,
  };

  // Build outcome result
  const outcome = {
    expected: case_.expected.outcome,
    actual: result.isEmpty ? 'empty' : 'non-empty',
    matched: case_.expected.outcome === (result.isEmpty ? 'empty' : 'non-empty'),
  };

  return {
    caseId: case_.caseId,
    verdicts,
    passed: verdicts.every((v) => v.passed),
    governance,
    outcome,
    warnings,
  };
}

/**
 * Extract governance failures from verdicts.
 * Used for reporting while keeping verdicts as the source of truth.
 */
export function extractGovernanceFailures(verdicts: CaseVerdicts): GovernanceFailure[] {
  return verdicts.verdicts
    .filter((v): v is typeof v & { failure: GovernanceFailure } => !v.passed && !!v.failure)
    .map((v) => v.failure);
}

/**
 * Check if verdicts have any governance-related failures.
 * Governance failures are forbidden-hit and shape-mismatch kinds.
 */
export function hasGovernanceFailure(verdicts: CaseVerdicts): boolean {
  return verdicts.verdicts.some(
    (v) => !v.passed && (v.kind === 'governance' || v.kind === 'shape'),
  );
}

/**
 * Check if verdicts have outcome mismatch.
 */
export function hasOutcomeMismatch(verdicts: CaseVerdicts): boolean {
  return verdicts.verdicts.some((v) => !v.passed && v.kind === 'outcome');
}

/**
 * Check if verdicts have execution issues.
 */
export function hasExecutionIssue(verdicts: CaseVerdicts): boolean {
  return verdicts.verdicts.some((v) => !v.passed && v.kind === 'execution');
}
