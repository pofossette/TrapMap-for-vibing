/**
 * Unified duplicate detector for candidate submissions.
 * Compares candidates against both traps and skills for similarity.
 *
 * Two-stage detection:
 * 1. Jaccard pre-filter (fast, in-memory) — narrows candidates
 * 2. LLM judgment (optional) — refines top-K matches when ChatProvider available
 *
 * @module candidates/detector
 */

import type { DuplicateCase, DuplicateMatch } from '@trapmap/contracts';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { createDuplicateCaseId } from '@trapmap/server/lib/ids.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { tokenize } from './fingerprint.js';
import { judgeDuplicateWithLLM } from './llm-dedup.js';
import type { DuplicateDetectionInput, DuplicateDetectionResult } from './types.js';

const DETECTION_VERSION = '2.0.0';
const HIGH_OVERLAP_THRESHOLD = 0.72;

/** Pre-filter threshold for LLM refinement stage — lower than HIGH_OVERLAP to cast a wider net */
const LLM_PREFILTER_THRESHOLD = 0.3;

/** Maximum number of Jaccard pre-filter matches sent to LLM for refinement */
const LLM_TOP_K = 5;

/** Minimum LLM confidence to confirm a duplicate */
const LLM_DUPLICATE_CONFIDENCE = 0.8;

/**
 * Calculate Jaccard-like overlap score between two token sets.
 * Matches pre-review.ts logic for consistency.
 */
function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }

  return shared / new Set([...a, ...b]).size;
}

/**
 * Calculate keyword overlap percentage.
 */
function keywordOverlapPercent(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setA = new Set(a.map((k) => k.toLowerCase()));
  const setB = new Set(b.map((k) => k.toLowerCase()));

  let shared = 0;
  for (const kw of setA) {
    if (setB.has(kw)) {
      shared += 1;
    }
  }

  return (shared / Math.max(setA.size, setB.size)) * 100;
}

/**
 * Determine match type based on similarity score.
 */
function toMatchType(
  score: number,
  isExactFingerprint: boolean,
): 'exact' | 'high-overlap' | 'semantic-similar' {
  if (isExactFingerprint) {
    return 'exact';
  }
  if (score >= HIGH_OVERLAP_THRESHOLD) {
    return 'high-overlap';
  }
  return 'semantic-similar';
}

/**
 * Check trap entry for duplicates against candidate.
 * When `minThreshold` is provided, returns matches above that lower bar
 * for LLM refinement; otherwise uses the standard threshold.
 */
function checkTrapDuplicate(
  candidateTokens: Set<string>,
  candidateKeywords: string[],
  _candidateFingerprint: string,
  entry: KnowledgeRecord,
  threshold: number,
  minThreshold?: number,
): DuplicateMatch | null {
  const entryText = `${entry.shortcut}\n${entry.detail}`;
  const entryTokens = tokenize(entryText);

  const similarity = overlapScore(candidateTokens, entryTokens);
  const effectiveThreshold = minThreshold ?? threshold;

  if (similarity < effectiveThreshold) {
    return null;
  }

  const isExact = false; // Traps don't have fingerprint stored yet
  const sharedTokens = [...candidateTokens].filter((t) => entryTokens.has(t));
  const sharedKeywords = candidateKeywords.filter((k) =>
    entry.labels.some((l) => l.toLowerCase() === k.toLowerCase()),
  );

  return {
    entityType: 'trap',
    entityId: entry.id,
    entityTitle: entry.shortcut.slice(0, 280),
    similarityScore: Math.round(similarity * 1000) / 1000, // 3 decimal places
    matchType: toMatchType(similarity, isExact),
    overlapDetails: {
      sharedKeywords,
      sharedTokens: sharedTokens.slice(0, 50), // Limit for storage
      textOverlapPercent:
        Math.round(keywordOverlapPercent(candidateKeywords, entry.labels) * 10) / 10,
    },
  };
}

/**
 * Check skill artifact for duplicates against candidate.
 * When `minThreshold` is provided, returns matches above that lower bar
 * for LLM refinement; otherwise uses the standard threshold.
 */
function checkSkillDuplicate(
  candidateTokens: Set<string>,
  candidateKeywords: string[],
  candidateFingerprint: string,
  artifact: SkillArtifactRecord,
  threshold: number,
  minThreshold?: number,
): DuplicateMatch | null {
  const profile = artifact.latestRevision.derived?.profile;
  if (!profile) {
    return null;
  }

  const artifactText = `${profile.title}\n${profile.summary}`;
  const artifactTokens = tokenize(artifactText);

  const similarity = overlapScore(candidateTokens, artifactTokens);
  const effectiveThreshold = minThreshold ?? threshold;

  if (similarity < effectiveThreshold) {
    return null;
  }

  // Check for exact fingerprint match
  const isExact = profile.contentHash === candidateFingerprint;

  const sharedTokens = [...candidateTokens].filter((t) => artifactTokens.has(t));
  const sharedKeywords = candidateKeywords.filter((k) =>
    profile.keywords.some((pk) => pk.toLowerCase() === k.toLowerCase()),
  );

  return {
    entityType: 'skill',
    entityId: artifact.id,
    entityTitle: profile.title.slice(0, 280),
    similarityScore: Math.round(similarity * 1000) / 1000,
    matchType: toMatchType(similarity, isExact),
    overlapDetails: {
      sharedKeywords,
      sharedTokens: sharedTokens.slice(0, 50),
      textOverlapPercent:
        Math.round(keywordOverlapPercent(candidateKeywords, profile.keywords) * 10) / 10,
    },
  };
}

/**
 * Detect duplicates across both traps and skills.
 * Main entry point for duplicate detection.
 *
 * Two-stage approach when ChatProvider is available:
 * 1. Jaccard pre-filter with lower threshold to find top-K candidates
 * 2. LLM judgment to confirm/reject each candidate pair
 *
 * Falls back to pure Jaccard when ChatProvider is not configured or LLM fails.
 */
export async function detectDuplicates(
  input: DuplicateDetectionInput,
  chat?: ChatProvider,
): Promise<DuplicateDetectionResult> {
  const candidateTokens = new Set(input.candidateTokens);
  const useLLM = chat?.isConfigured ?? false;
  const preFilterThreshold = useLLM ? LLM_PREFILTER_THRESHOLD : input.threshold;

  // Collect all candidate matches (trap entries)
  const trapMatches: DuplicateMatch[] = [];
  const trapEntryMap = new Map<string, KnowledgeRecord>();
  for (const entry of input.trapEntries) {
    if (entry.lifecycleState !== 'approved') continue;
    trapEntryMap.set(entry.id, entry);

    const match = checkTrapDuplicate(
      candidateTokens,
      input.candidateKeywords,
      input.candidateFingerprint,
      entry,
      input.threshold,
      preFilterThreshold,
    );
    if (match) trapMatches.push(match);
  }

  // Collect all candidate matches (skill artifacts)
  const skillMatches: DuplicateMatch[] = [];
  const skillArtifactMap = new Map<string, SkillArtifactRecord>();
  for (const artifact of input.skillArtifacts) {
    if (artifact.lifecycleState !== 'approved') continue;
    skillArtifactMap.set(artifact.id, artifact);

    const match = checkSkillDuplicate(
      candidateTokens,
      input.candidateKeywords,
      input.candidateFingerprint,
      artifact,
      input.threshold,
      preFilterThreshold,
    );
    if (match) skillMatches.push(match);
  }

  // Combine and sort by similarity
  const allMatches = [...trapMatches, ...skillMatches];
  allMatches.sort((a, b) => b.similarityScore - a.similarityScore);

  // Stage 2: LLM refinement (if configured)
  let matches: DuplicateMatch[];

  if (useLLM && allMatches.length > 0) {
    // Take top-K for LLM refinement
    const topK = allMatches.slice(0, LLM_TOP_K);
    const refinedMatches: DuplicateMatch[] = [];

    for (const match of topK) {
      const existingEntry =
        match.entityType === 'trap'
          ? trapEntryMap.get(match.entityId)
          : skillArtifactMap.get(match.entityId);

      if (!existingEntry) continue;

      // Extract title/body for LLM comparison
      let existingTitle: string;
      let existingBody: string;
      if (match.entityType === 'trap') {
        const trap = existingEntry as KnowledgeRecord;
        existingTitle = trap.shortcut;
        existingBody = trap.detail;
      } else {
        const skill = existingEntry as SkillArtifactRecord;
        const profile = skill.latestRevision.derived?.profile;
        if (!profile) continue;
        existingTitle = profile.title;
        existingBody = profile.summary;
      }

      const candidateTitle = input.candidateKeywords.slice(0, 5).join(', ');
      const candidateBody = [...candidateTokens].slice(0, 100).join(' ');

      const judgment = await judgeDuplicateWithLLM(
        chat!,
        { title: candidateTitle, body: candidateBody },
        { title: existingTitle, body: existingBody },
      );

      if (judgment?.isDuplicate && judgment.confidence >= LLM_DUPLICATE_CONFIDENCE) {
        // LLM confirmed as duplicate — update match type based on LLM classification
        refinedMatches.push({
          ...match,
          matchType:
            judgment.overlapType === 'exact'
              ? 'exact'
              : judgment.overlapType === 'semantic'
                ? 'high-overlap'
                : match.matchType,
          similarityScore: Math.max(match.similarityScore, judgment.confidence),
        });
      }
      // If LLM says not a duplicate or low confidence, exclude the match
    }

    matches = refinedMatches;
  } else {
    // Pure Jaccard fallback — use original threshold
    matches = allMatches.filter((m) => m.similarityScore >= input.threshold);
  }

  // Limit to top 10 matches
  matches = matches.slice(0, 10);

  // Determine if we have a duplicate case
  const hasMatches = matches.length > 0;
  const highestSimilarity = hasMatches && matches[0] ? matches[0].similarityScore : 0;
  const hasExactDuplicate = matches.some((m) => m.matchType === 'exact');

  let duplicateType: 'exact' | 'semantic' | 'none' = 'none';
  if (hasExactDuplicate) {
    duplicateType = 'exact';
  } else if (highestSimilarity >= HIGH_OVERLAP_THRESHOLD) {
    duplicateType = 'semantic';
  }

  const duplicateCase: DuplicateCase | null = hasMatches
    ? {
        id: createDuplicateCaseId(),
        candidateId: input.candidateId,
        detectedAt: nowIso(),
        detectionVersion: DETECTION_VERSION,
        matches,
        highestSimilarity,
        hasExactDuplicate,
        duplicateType,
      }
    : null;

  return {
    duplicateCase,
    analysisSnapshot: {
      normalizedAt: nowIso(),
      fingerprint: input.candidateFingerprint,
      keywords: input.candidateKeywords,
      tokens: input.candidateTokens,
    },
  };
}

/**
 * Get the detection algorithm version.
 */
export function getDetectionVersion(): string {
  return DETECTION_VERSION;
}
