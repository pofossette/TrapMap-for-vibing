/**
 * Conflict detection algorithm for knowledge entries.
 *
 * Detects when two knowledge entries address the same problem but propose
 * different solutions. Classifies conflicts as:
 * - alternative: Different valid approaches (e.g., REST vs GraphQL)
 * - contradictory: Directly opposing solutions (e.g., "use X" vs "avoid X")
 * - superseded: Newer entry replaces older approach
 *
 * Two-stage detection (Phase 2):
 * 1. Jaccard pre-filter with relaxed threshold (0.3) to find candidate pairs
 * 2. LLM judgment to classify conflict type (when ChatProvider available)
 *
 * Falls back to pure Jaccard classification when LLM is not configured.
 *
 * CONFLICT-01: Conflict relationship detection and classification
 */

import type { ConflictRelation, ConflictType } from '@trapmap/contracts';

import type { ChatProvider } from '../ai/types.js';
import type { SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
import { judgeConflictWithLLM } from './llm-conflict.js';

/** Relaxed problem overlap threshold for Jaccard pre-filter (was 0.5, now 0.3 for wider LLM net) */
const PROBLEM_OVERLAP_THRESHOLD = 0.3;

/** Minimum solution difference to consider entries as conflicting (Jaccard fallback) */
const SOLUTION_DIFF_THRESHOLD = 0.3;

/** High solution difference threshold for "contradictory" classification (Jaccard fallback) */
const CONTRADICTORY_THRESHOLD = 0.8;

/** Medium solution difference threshold for "alternative" classification (Jaccard fallback) */
const ALTERNATIVE_THRESHOLD = 0.4;

/**
 * Tokenize text into a set of lowercase tokens.
 * Filters out tokens shorter than 3 characters.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

/**
 * Calculate Jaccard overlap score between two token sets.
 * Returns 0 if either set is empty.
 */
export function overlapScore(a: Set<string>, b: Set<string>): number {
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
 * Classify conflict type based on overlap and difference scores.
 * Returns null if entries don't meet conflict thresholds.
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

/**
 * Generate human-readable context for a conflict.
 */
export function generateConflictContext(
  entryA: { shortcut: string },
  entryB: { shortcut: string },
  conflictType: ConflictType,
): string {
  const typeDescriptions: Record<ConflictType, string> = {
    alternative: 'Different approaches to the same problem',
    contradictory: 'Opposing solutions for the same problem',
    superseded: 'Newer approach supersedes older one',
  };
  return `${typeDescriptions[conflictType]}: "${entryA.shortcut}" vs "${entryB.shortcut}"`;
}

export interface ConflictDetectionInput {
  services: {
    store: SkillShareerStore;
    data: StoreData;
  };
  entryId: string;
  /** Optional ChatProvider for LLM-enhanced conflict classification */
  chat?: ChatProvider;
}

/**
 * Detect conflicts between a newly approved entry and existing entries.
 *
 * Two-stage approach:
 * 1. Jaccard pre-filter with relaxed threshold to find candidate pairs
 * 2. LLM judgment to classify conflict type (when ChatProvider available)
 *
 * Falls back to pure Jaccard classification when LLM is not configured.
 *
 * @param input - Detection input with store services, entry ID, and optional ChatProvider
 * @returns Array of detected conflict relations (may be empty)
 */
export async function detectConflicts(input: ConflictDetectionInput): Promise<ConflictRelation[]> {
  const { services, entryId, chat } = input;
  const { data } = services;
  const useLLM = chat?.isConfigured ?? false;

  // Find the newly approved entry
  const newEntry = data.knowledgeEntries.find((e) => e.id === entryId);
  if (!newEntry || newEntry.lifecycleState !== 'approved') {
    return [];
  }

  const detectedConflicts: ConflictRelation[] = [];
  const newProblemTokens = tokenize(newEntry.shortcut);
  const newSolutionTokens = tokenize(newEntry.detail);

  // Compare against all other approved entries
  for (const existingEntry of data.knowledgeEntries) {
    if (existingEntry.id === entryId) continue;
    if (existingEntry.lifecycleState !== 'approved') continue;

    const existingProblemTokens = tokenize(existingEntry.shortcut);
    const existingSolutionTokens = tokenize(existingEntry.detail);

    const problemOverlap = overlapScore(newProblemTokens, existingProblemTokens);
    // Solution difference is 1 - overlap (high overlap = similar solutions = low conflict)
    const solutionSimilarity = overlapScore(newSolutionTokens, existingSolutionTokens);
    const solutionDiff = 1 - solutionSimilarity;

    // Stage 1: Jaccard pre-filter — relaxed threshold for LLM candidate selection
    if (problemOverlap < PROBLEM_OVERLAP_THRESHOLD) continue;

    let conflictType: ConflictType | null = null;
    let llmResolution: string | undefined;

    // Stage 2: LLM refinement (if configured)
    if (useLLM) {
      const judgment = await judgeConflictWithLLM(
        chat!,
        { title: newEntry.shortcut, body: newEntry.detail },
        { title: existingEntry.shortcut, body: existingEntry.detail },
      );

      if (judgment && judgment.conflictType !== 'none') {
        conflictType = judgment.conflictType;
        llmResolution = judgment.resolution;
      }
      // If LLM returns 'none' or fails, fall through to Jaccard
    }

    // Jaccard fallback: use classic threshold-based classification
    if (!conflictType) {
      if (solutionDiff < SOLUTION_DIFF_THRESHOLD) continue;
      if (solutionDiff >= CONTRADICTORY_THRESHOLD) conflictType = 'contradictory';
      else if (solutionDiff >= ALTERNATIVE_THRESHOLD) conflictType = 'alternative';
      else conflictType = 'superseded';
    }

    if (!conflictType) continue;

    // Canonical ordering: lower entryId first
    const sortedIds = [newEntry.id, existingEntry.id].sort() as [string, string];
    const [entryIdA, entryIdB] = sortedIds;

    // Check if this conflict already exists
    const existingConflict = data.conflicts.find(
      (c) => c.entryIdA === entryIdA && c.entryIdB === entryIdB,
    );
    if (existingConflict) continue;

    const context = generateConflictContext(
      entryIdA === newEntry.id ? newEntry : existingEntry,
      entryIdA === newEntry.id ? existingEntry : newEntry,
      conflictType,
    );

    const conflict: ConflictRelation = {
      id: services.store.nextId(data, 'conflict'),
      entryIdA,
      entryIdB,
      conflictType,
      context: llmResolution ? `${context} | Resolution: ${llmResolution}` : context,
      problemOverlapScore: problemOverlap,
      solutionDiffScore: solutionDiff,
      detectedAt: nowIso(),
    };

    detectedConflicts.push(conflict);
  }

  // Persist conflicts if any were detected
  if (detectedConflicts.length > 0) {
    await services.store.transact((data) => {
      data.conflicts.push(...detectedConflicts);
    });
  }

  return detectedConflicts;
}
