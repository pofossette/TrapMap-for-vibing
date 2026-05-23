/**
 * Capsule recall helpers for Phase 14 v2 retrieval.
 * Provides profile shortlist and capsule ranking with governance enforcement.
 *
 * RETR-03: Capsule-native recall from artifact-derived outputs
 * CAPS-04: Capsule ranking with intent signals and stack/path boosts
 * CAPS-04-CTX: Context-aware scoring using Anthropic Contextual Retrieval prefixes
 * T-14-04: Preserve approval/team/level filtering before ranking
 * T-14-06: Rank only distilled profile/capsule text, not raw payloads
 */

import { isGovernanceEligible } from '@trapmap/server/lib/governance/index.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleCandidate,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type {
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';

/**
 * Check if an artifact passes governance filters.
 * Delegates to shared governance module for unified eligibility logic.
 * T-14-04: Preserve approval/team/level filtering before ranking
 *
 * @param artifact - Skill artifact record
 * @param filters - Governance filters (teamId, securityLevel, isSystemAdmin)
 * @returns True if artifact is eligible for retrieval
 */
export function isArtifactGovernanceEligible(
  artifact: SkillArtifactRecord,
  filters: ArtifactGovernanceFilters,
): boolean {
  const entity = {
    teamId: artifact.teamId,
    scope: artifact.scope,
    requiredLevel: artifact.requiredLevel,
    lifecycleState: artifact.lifecycleState,
  };

  const context = {
    teamId: filters.teamId,
    securityLevel: filters.securityLevel,
    isSystemAdmin: filters.isSystemAdmin,
  };

  return isGovernanceEligible(entity, context);
}

/**
 * Build profile shortlist from governed artifacts.
 * Returns profiles from approved, in-scope, within-level artifacts.
 *
 * @param artifacts - Skill artifact records
 * @param filters - Governance filters
 * @returns Array of eligible profiles with their artifacts
 */
export function buildProfileShortlist(
  artifacts: SkillArtifactRecord[],
  filters: ArtifactGovernanceFilters,
): Array<{ artifact: SkillArtifactRecord; profile: DerivedSkillProfileRecord }> {
  const shortlist: Array<{ artifact: SkillArtifactRecord; profile: DerivedSkillProfileRecord }> =
    [];

  for (const artifact of artifacts) {
    // Apply governance filters
    if (!isArtifactGovernanceEligible(artifact, filters)) {
      continue;
    }

    // Check if artifact has derived outputs
    const profile = artifact.latestRevision.derived?.profile;
    if (!profile) {
      continue;
    }

    shortlist.push({ artifact, profile });
  }

  return shortlist;
}

/**
 * Extract capsules from governed artifacts.
 * Returns capsules that pass governance and have derived content.
 *
 * @param artifacts - Skill artifact records
 * @param filters - Governance filters
 * @returns Array of eligible capsules with their artifacts
 */
export function extractGovernedCapsules(
  artifacts: SkillArtifactRecord[],
  filters: ArtifactGovernanceFilters,
): Array<{ artifact: SkillArtifactRecord; capsule: DerivedSkillCapsuleRecord }> {
  const capsules: Array<{ artifact: SkillArtifactRecord; capsule: DerivedSkillCapsuleRecord }> = [];

  for (const artifact of artifacts) {
    // Apply governance filters
    if (!isArtifactGovernanceEligible(artifact, filters)) {
      continue;
    }

    // Check if artifact has derived capsules
    const derivedCapsules = artifact.latestRevision.derived?.capsules;
    if (!derivedCapsules || derivedCapsules.length === 0) {
      continue;
    }

    for (const capsule of derivedCapsules) {
      capsules.push({ artifact, capsule });
    }
  }

  return capsules;
}

/**
 * Compute text similarity score between query and target.
 * Uses token overlap for keyword-style matching.
 *
 * @param query - Query text
 * @param target - Target text
 * @returns Similarity score [0, 1]
 */
function computeTextSimilarity(query: string, target: string): number {
  const queryTokens = new Set(
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  const targetTokens = new Set(
    target
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );

  if (queryTokens.size === 0 || targetTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) {
      overlap++;
    }
  }

  // Jaccard-like similarity
  return overlap / Math.sqrt(queryTokens.size * targetTokens.size);
}

/**
 * Compute situation match score from parsed intent.
 *
 * @param intent - Parsed intent from seed
 * @param capsule - Capsule to score
 * @returns Situation match score [0, 1]
 */
export function computeSituationScore(
  intent: ParsedIntent,
  capsule: DerivedSkillCapsuleRecord,
): number {
  if (!intent.situation) {
    return 0;
  }
  return computeTextSimilarity(intent.situation, capsule.situation);
}

/**
 * Compute problem match score from parsed intent.
 *
 * @param intent - Parsed intent from seed
 * @param capsule - Capsule to score
 * @returns Problem match score [0, 1]
 */
export function computeProblemScore(
  intent: ParsedIntent,
  capsule: DerivedSkillCapsuleRecord,
): number {
  const problemText = intent.problem ?? '';
  const errorText = intent.errorText ?? '';
  const queryText = `${problemText} ${errorText}`.trim();

  if (!queryText) {
    // Fall back to normalized seed
    return computeTextSimilarity(intent.normalized, capsule.problem);
  }

  return computeTextSimilarity(queryText, capsule.problem);
}

/**
 * Compute goal match score from parsed intent.
 *
 * @param intent - Parsed intent from seed
 * @param capsule - Capsule to score
 * @returns Goal match score [0, 1]
 */
export function computeGoalScore(intent: ParsedIntent, capsule: DerivedSkillCapsuleRecord): number {
  if (!intent.goal) {
    return 0;
  }
  return computeTextSimilarity(intent.goal, capsule.goal);
}

/**
 * Compute error text match score from parsed intent.
 *
 * @param intent - Parsed intent from seed
 * @param capsule - Capsule to score
 * @returns Error match score [0, 1] or null if no error in intent
 */
export function computeErrorScore(
  intent: ParsedIntent,
  capsule: DerivedSkillCapsuleRecord,
): number | null {
  if (!intent.errorText) {
    return null;
  }

  if (!capsule.errorText) {
    return 0;
  }

  return computeTextSimilarity(intent.errorText, capsule.errorText);
}

/**
 * Compute stack/path boost from hints.
 * Boosts score when capsule content matches detected stack/path hints.
 *
 * @param intent - Parsed intent with stack/path hints
 * @param capsule - Capsule to score
 * @returns Boost factor [1.0, 1.5]
 */
export function computeStackPathBoost(
  intent: ParsedIntent,
  capsule: DerivedSkillCapsuleRecord,
): number {
  if (intent.stackPathHints.length === 0) {
    return 1.0;
  }

  const capsuleText = `${capsule.content} ${capsule.situation} ${capsule.problem}`.toLowerCase();

  let matchCount = 0;
  for (const hint of intent.stackPathHints) {
    if (capsuleText.includes(hint.hint.toLowerCase())) {
      matchCount++;
    }
  }

  // Boost up to 1.5 based on proportion of matching hints
  const boostRatio = matchCount / intent.stackPathHints.length;
  return 1.0 + boostRatio * 0.5;
}

/**
 * Compute keyword overlap score from intent tokens.
 *
 * @param intent - Parsed intent with normalized tokens
 * @param capsule - Capsule to score
 * @returns Keyword overlap score [0, 1]
 */
export function computeKeywordScore(
  intent: ParsedIntent,
  capsule: DerivedSkillCapsuleRecord,
): number {
  // Combine capsule text for matching
  const capsuleText = `${capsule.content} ${capsule.labels.join(' ')}`.toLowerCase();

  // Count matching tokens
  let matchCount = 0;
  for (const token of intent.tokens) {
    if (capsuleText.includes(token.token)) {
      matchCount++;
    }
  }

  if (intent.tokens.length === 0) {
    return 0;
  }

  return matchCount / intent.tokens.length;
}

/**
 * Compute contextual prefix match score from parsed intent.
 * Matches the query against the capsule's contextualPrefix (Anthropic Contextual Retrieval).
 * Returns 0 when no contextualPrefix is present.
 *
 * CAPS-04-CTX: Context-aware scoring using LLM-generated contextual prefixes
 *
 * @param intent - Parsed intent from seed
 * @param capsule - Capsule to score
 * @returns Context match score [0, 1]
 */
export function computeContextMatchScore(
  intent: ParsedIntent,
  capsule: DerivedSkillCapsuleRecord,
): number {
  if (!capsule.contextualPrefix) {
    return 0;
  }
  return computeTextSimilarity(intent.normalized, capsule.contextualPrefix);
}

/**
 * Build a human-readable reason string for a capsule match.
 *
 * @param capsule - Capsule record
 * @param scores - Score breakdown
 * @returns Reason string
 */
function buildMatchReason(
  capsule: DerivedSkillCapsuleRecord,
  scores: {
    situationScore: number;
    problemScore: number;
    goalScore: number;
    keywordScore: number;
    contextScore: number;
    stackPathBoost: number;
  },
): string {
  const parts: string[] = [];

  if (scores.problemScore > 0.3) {
    parts.push(`problem match (${(scores.problemScore * 100).toFixed(0)}%)`);
  }

  if (scores.situationScore > 0.3) {
    parts.push(`situation match (${(scores.situationScore * 100).toFixed(0)}%)`);
  }

  if (scores.goalScore > 0.3) {
    parts.push(`goal match (${(scores.goalScore * 100).toFixed(0)}%)`);
  }

  if (scores.keywordScore > 0.3) {
    parts.push(`keyword match (${(scores.keywordScore * 100).toFixed(0)}%)`);
  }

  if (scores.contextScore > 0.3) {
    parts.push(`context match (${(scores.contextScore * 100).toFixed(0)}%)`);
  }

  if (scores.stackPathBoost > 1.1) {
    parts.push('stack/path boost');
  }

  if (parts.length === 0) {
    return `Capsule from ${capsule.sourcePaths[0] ?? 'unknown'}`;
  }

  return `Matched: ${parts.join(', ')}`;
}

/**
 * Rank capsules against parsed intent with governance filtering.
 *
 * Pipeline:
 * 1. Extract governed capsules (T-14-04)
 * 2. Score each capsule against intent signals (situation, problem, goal, keyword, context)
 * 3. Apply stack/path boosts
 * 4. Sort by final score descending
 *
 * Weight distribution (CAPS-04-CTX):
 *   problem 0.30 | situation 0.21 | goal 0.17 | keyword 0.17 | context 0.15
 *
 * @param artifacts - Skill artifact records
 * @param intent - Parsed intent from seed
 * @param filters - Governance filters
 * @param maxResults - Maximum capsules to return
 * @returns Ranked capsule candidates
 */
export function rankCapsules(
  artifacts: SkillArtifactRecord[],
  intent: ParsedIntent,
  filters: ArtifactGovernanceFilters,
  maxResults: number,
): CapsuleCandidate[] {
  // Extract governed capsules (T-14-04)
  const governedCapsules = extractGovernedCapsules(artifacts, filters);

  // Score each capsule
  const candidates: CapsuleCandidate[] = [];

  for (const { capsule } of governedCapsules) {
    const situationScore = computeSituationScore(intent, capsule);
    const problemScore = computeProblemScore(intent, capsule);
    const goalScore = computeGoalScore(intent, capsule);
    const errorScore = computeErrorScore(intent, capsule);
    const keywordScore = computeKeywordScore(intent, capsule);
    const contextScore = computeContextMatchScore(intent, capsule);
    const stackPathBoost = computeStackPathBoost(intent, capsule);

    // Weighted combination (CAPS-04-CTX: 15% weight for contextual prefix)
    const baseScore =
      problemScore * 0.3 + // Problem is most important
      situationScore * 0.21 +
      goalScore * 0.17 +
      keywordScore * 0.17 +
      contextScore * 0.15; // Anthropic Contextual Retrieval

    const finalScore = Math.min(1, baseScore * stackPathBoost);

    const reason = buildMatchReason(capsule, {
      situationScore,
      problemScore,
      goalScore,
      keywordScore,
      contextScore,
      stackPathBoost,
    });

    candidates.push({
      capsuleId: capsule.capsuleId,
      artifactId: capsule.artifactId,
      revision: capsule.revision,
      situationScore,
      problemScore,
      goalScore,
      errorScore,
      contextScore,
      stackPathBoost,
      finalScore,
      reason,
    });
  }

  // Sort by final score descending
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // Return top results
  return candidates.slice(0, maxResults);
}

/**
 * Get full capsule records for ranked candidates.
 *
 * @param artifacts - Skill artifact records
 * @param candidates - Ranked capsule candidates
 * @returns Capsule records with artifacts
 */
export function getCapsuleRecords(
  artifacts: SkillArtifactRecord[],
  candidates: CapsuleCandidate[],
): Array<{
  artifact: SkillArtifactRecord;
  capsule: DerivedSkillCapsuleRecord;
  candidate: CapsuleCandidate;
}> {
  const results: Array<{
    artifact: SkillArtifactRecord;
    capsule: DerivedSkillCapsuleRecord;
    candidate: CapsuleCandidate;
  }> = [];

  for (const candidate of candidates) {
    const artifact = artifacts.find((a) => a.id === candidate.artifactId);
    if (!artifact) continue;

    const capsule = artifact.latestRevision.derived?.capsules.find(
      (c) => c.capsuleId === candidate.capsuleId,
    );
    if (!capsule) continue;

    results.push({ artifact, capsule, candidate });
  }

  return results;
}
