/**
 * Conflict enrichment module for retrieval responses.
 *
 * Provides functions to:
 * - Build conflict lookup maps for O(1) retrieval
 * - Convert conflict relations to display hints
 * - Enrich retrieval matches with conflict information
 * - Apply governance filtering to conflict hints
 *
 * CONFLICT-01: Conflict enrichment with governance filtering
 */

import type { ConflictHint, ConflictRelation } from '@trapmap/contracts';

import type { KnowledgeRecord, StoreData } from '@trapmap/server/lib/store.js';

/**
 * Build a Map from entryId to its conflicts.
 * Each entry can appear in either entryIdA or entryIdB position.
 */
export function buildConflictLookup(
  conflicts: ConflictRelation[],
): Map<string, ConflictRelation[]> {
  const lookup = new Map<string, ConflictRelation[]>();

  for (const conflict of conflicts) {
    // Add for entryIdA
    const forA = lookup.get(conflict.entryIdA) ?? [];
    forA.push(conflict);
    lookup.set(conflict.entryIdA, forA);

    // Add for entryIdB
    const forB = lookup.get(conflict.entryIdB) ?? [];
    forB.push(conflict);
    lookup.set(conflict.entryIdB, forB);
  }

  return lookup;
}

/**
 * Convert a ConflictRelation to a ConflictHint for the other entry.
 * @param conflict - The conflict record
 * @param targetEntryId - The entry we're generating a hint for
 * @param allEntries - All knowledge entries to look up shortcut
 */
export function conflictToHint(
  conflict: ConflictRelation,
  targetEntryId: string,
  allEntries: KnowledgeRecord[],
): ConflictHint | null {
  // Find the OTHER entry in this conflict
  const otherEntryId = conflict.entryIdA === targetEntryId ? conflict.entryIdB : conflict.entryIdA;

  const otherEntry = allEntries.find((e) => e.id === otherEntryId);
  if (!otherEntry) return null;

  return {
    entryId: otherEntryId,
    shortcut: otherEntry.shortcut,
    conflictType: conflict.conflictType,
    context: conflict.context,
  };
}

/**
 * Get conflict hints for a specific entry.
 * @param entryId - The entry to get conflicts for
 * @param conflictLookup - Pre-built conflict lookup map
 * @param allEntries - All knowledge entries for shortcut lookup
 * @param governance - Governance filters (team, level) to respect
 */
export function getConflictHints(
  entryId: string,
  conflictLookup: Map<string, ConflictRelation[]>,
  allEntries: KnowledgeRecord[],
  governance?: { teamId: string | null; requiredLevel: number },
): ConflictHint[] {
  const conflicts = conflictLookup.get(entryId) ?? [];
  const hints: ConflictHint[] = [];

  for (const conflict of conflicts) {
    // Find the other entry
    const otherEntryId = conflict.entryIdA === entryId ? conflict.entryIdB : conflict.entryIdA;

    const otherEntry = allEntries.find((e) => e.id === otherEntryId);
    if (!otherEntry) continue;

    // Governance filter: respect team and level
    if (governance) {
      // If entry is team-scoped and user doesn't have team access, skip
      if (otherEntry.teamId && otherEntry.teamId !== governance.teamId) {
        continue;
      }
      // If entry requires higher level than user has, skip
      if (otherEntry.requiredLevel > governance.requiredLevel) {
        continue;
      }
    }

    const hint = conflictToHint(conflict, entryId, allEntries);
    if (hint) hints.push(hint);
  }

  return hints;
}

/**
 * Enrich multiple retrieval matches with their conflicts.
 * Builds the lookup map once for O(n) performance.
 */
export function enrichMatchesWithConflicts(
  matches: Array<{ entryId: string }>,
  data: StoreData,
  governance?: { teamId: string | null; requiredLevel: number },
): Map<string, ConflictHint[]> {
  const conflictLookup = buildConflictLookup(data.conflicts);
  const result = new Map<string, ConflictHint[]>();

  for (const match of matches) {
    const hints = getConflictHints(
      match.entryId,
      conflictLookup,
      data.knowledgeEntries,
      governance,
    );
    if (hints.length > 0) {
      result.set(match.entryId, hints);
    }
  }

  return result;
}
