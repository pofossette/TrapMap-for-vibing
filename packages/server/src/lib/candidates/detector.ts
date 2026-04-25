/**
 * Unified duplicate detector for candidate submissions.
 * Compares candidates against both traps and skills for similarity.
 *
 * @module candidates/detector
 */

import type { KnowledgeRecord, SkillArtifactRecord } from '../store.js';
import type { DuplicateCase, DuplicateMatch } from '@trapmap/contracts';
import type { DuplicateDetectionInput, DuplicateDetectionResult } from './types.js';
import { createDuplicateCaseId } from '../ids.js';
import { nowIso } from '../store.js';
import { tokenize } from './fingerprint.js';

const DETECTION_VERSION = '1.0.0';
const HIGH_OVERLAP_THRESHOLD = 0.72;
const MEDIUM_OVERLAP_THRESHOLD = 0.38;

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

  const setA = new Set(a.map(k => k.toLowerCase()));
  const setB = new Set(b.map(k => k.toLowerCase()));

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
function toMatchType(score: number, isExactFingerprint: boolean): 'exact' | 'high-overlap' | 'semantic-similar' {
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
 */
function checkTrapDuplicate(
  candidateTokens: Set<string>,
  candidateKeywords: string[],
  candidateFingerprint: string,
  entry: KnowledgeRecord,
  threshold: number,
): DuplicateMatch | null {
  const entryText = `${entry.shortcut}\n${entry.detail}`;
  const entryTokens = tokenize(entryText);

  const similarity = overlapScore(candidateTokens, entryTokens);

  if (similarity < threshold) {
    return null;
  }

  const isExact = false; // Traps don't have fingerprint stored yet
  const sharedTokens = [...candidateTokens].filter(t => entryTokens.has(t));
  const sharedKeywords = candidateKeywords.filter(k =>
    entry.labels.some(l => l.toLowerCase() === k.toLowerCase())
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
      textOverlapPercent: Math.round(keywordOverlapPercent(candidateKeywords, entry.labels) * 10) / 10,
    },
  };
}

/**
 * Check skill artifact for duplicates against candidate.
 */
function checkSkillDuplicate(
  candidateTokens: Set<string>,
  candidateKeywords: string[],
  candidateFingerprint: string,
  artifact: SkillArtifactRecord,
  threshold: number,
): DuplicateMatch | null {
  const profile = artifact.latestRevision.derived?.profile;
  if (!profile) {
    return null;
  }

  const artifactText = `${profile.title}\n${profile.summary}`;
  const artifactTokens = tokenize(artifactText);

  const similarity = overlapScore(candidateTokens, artifactTokens);

  if (similarity < threshold) {
    return null;
  }

  // Check for exact fingerprint match
  const isExact = profile.contentHash === candidateFingerprint;

  const sharedTokens = [...candidateTokens].filter(t => artifactTokens.has(t));
  const sharedKeywords = candidateKeywords.filter(k =>
    profile.keywords.some(pk => pk.toLowerCase() === k.toLowerCase())
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
      textOverlapPercent: Math.round(keywordOverlapPercent(candidateKeywords, profile.keywords) * 10) / 10,
    },
  };
}

/**
 * Detect duplicates across both traps and skills.
 * Main entry point for duplicate detection.
 */
export async function detectDuplicates(
  input: DuplicateDetectionInput,
): Promise<DuplicateDetectionResult> {
  const candidateTokens = new Set(input.candidateTokens);
  const matches: DuplicateMatch[] = [];

  // Check against trap entries
  for (const entry of input.trapEntries) {
    // Skip non-approved entries for duplicate comparison
    if (entry.lifecycleState !== 'approved') {
      continue;
    }

    const match = checkTrapDuplicate(
      candidateTokens,
      input.candidateKeywords,
      input.candidateFingerprint,
      entry,
      input.threshold,
    );

    if (match) {
      matches.push(match);
    }
  }

  // Check against skill artifacts
  for (const artifact of input.skillArtifacts) {
    // Skip non-approved artifacts
    if (artifact.lifecycleState !== 'approved') {
      continue;
    }

    const match = checkSkillDuplicate(
      candidateTokens,
      input.candidateKeywords,
      input.candidateFingerprint,
      artifact,
      input.threshold,
    );

    if (match) {
      matches.push(match);
    }
  }

  // Sort matches by similarity (highest first)
  matches.sort((a, b) => b.similarityScore - a.similarityScore);

  // Determine if we have a duplicate case
  const hasMatches = matches.length > 0;
  const highestSimilarity = hasMatches && matches[0] ? matches[0].similarityScore : 0;
  const hasExactDuplicate = matches.some(m => m.matchType === 'exact');

  let duplicateType: 'exact' | 'semantic' | 'none' = 'none';
  if (hasExactDuplicate) {
    duplicateType = 'exact';
  } else if (highestSimilarity >= HIGH_OVERLAP_THRESHOLD) {
    duplicateType = 'semantic';
  }

  const duplicateCase: DuplicateCase | null = hasMatches ? {
    id: createDuplicateCaseId(),
    candidateId: input.candidateId,
    detectedAt: nowIso(),
    detectionVersion: DETECTION_VERSION,
    matches: matches.slice(0, 10), // Limit to top 10 matches
    highestSimilarity,
    hasExactDuplicate,
    duplicateType,
  } : null;

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
