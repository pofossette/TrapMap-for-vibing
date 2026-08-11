/**
 * Governance-review bounded context — conflict detection rules.
 *
 * Pure conflict classification rules (tokenization, Jaccard overlap,
 * threshold classification, canonical pair ordering, context rendering)
 * with zero framework / DB / I/O imports.
 */

import type { ConflictType } from '@trapmap/contracts';

export const PROBLEM_OVERLAP_THRESHOLD = 0.3;

export const SOLUTION_DIFF_THRESHOLD = 0.3;

export const CONTRADICTORY_THRESHOLD = 0.8;

export const ALTERNATIVE_THRESHOLD = 0.4;

/** Lowercase alphanumeric tokens of length >= 3. */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

/** Jaccard overlap score between two token sets. */
export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / new Set([...a, ...b]).size;
}

/**
 * Classify the conflict type from problem-overlap and solution-diff scores.
 * Returns null when the pair does not clear the minimum thresholds.
 */
export function classifyConflict(
  problemOverlap: number,
  solutionDiff: number,
): ConflictType | null {
  if (problemOverlap < PROBLEM_OVERLAP_THRESHOLD) return null;
  if (solutionDiff < SOLUTION_DIFF_THRESHOLD) return null;
  if (solutionDiff >= CONTRADICTORY_THRESHOLD) return 'contradictory';
  if (solutionDiff >= ALTERNATIVE_THRESHOLD) return 'alternative';
  return 'superseded';
}

/** Human-readable context describing a conflict relation. */
export function generateConflictContext(
  entryA: { shortcut: string },
  entryB: { shortcut: string },
  conflictType: ConflictType,
): string {
  const descriptions: Record<ConflictType, string> = {
    alternative: 'Different approaches to the same problem',
    contradictory: 'Opposing solutions for the same problem',
    superseded: 'Newer approach supersedes older one',
  };
  return `${descriptions[conflictType]}: "${entryA.shortcut}" vs "${entryB.shortcut}"`;
}

/** Canonical (entryIdA, entryIdB) ordering key for a conflict pair. */
export function relationKey(entryIdA: string, entryIdB: string): string {
  return `${entryIdA}\u0000${entryIdB}`;
}

/** Order a pair of entries canonically by id. */
export function canonicalEntries<T extends { id: string }>(
  current: T,
  candidate: T,
): [T, T] {
  return current.id < candidate.id ? [current, candidate] : [candidate, current];
}
