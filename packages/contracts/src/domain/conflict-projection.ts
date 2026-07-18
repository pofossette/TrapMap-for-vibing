import type { ConflictHint, ConflictRelation } from './conflict.js';

export interface ConflictProjectionEntry {
  id: string;
  shortcut: string;
  teamId: string | null;
  requiredLevel: number;
}

export interface ConflictProjectionActor {
  teamId: string | null;
  requiredLevel: number;
}

function isVisibleToActor(entry: ConflictProjectionEntry, actor: ConflictProjectionActor): boolean {
  return (
    (!entry.teamId || entry.teamId === actor.teamId) &&
    entry.requiredLevel <= actor.requiredLevel
  );
}

export function enrichConflictHints(
  matches: Array<{ entryId: string }>,
  conflicts: ConflictRelation[],
  entries: ConflictProjectionEntry[],
  actor: ConflictProjectionActor,
): Map<string, ConflictHint[]> {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const conflictsByEntryId = new Map<string, ConflictRelation[]>();

  for (const conflict of conflicts) {
    for (const entryId of [conflict.entryIdA, conflict.entryIdB]) {
      const related = conflictsByEntryId.get(entryId) ?? [];
      related.push(conflict);
      conflictsByEntryId.set(entryId, related);
    }
  }

  const result = new Map<string, ConflictHint[]>();
  for (const { entryId } of matches) {
    const hints = (conflictsByEntryId.get(entryId) ?? []).flatMap((conflict) => {
      const relatedEntryId = conflict.entryIdA === entryId ? conflict.entryIdB : conflict.entryIdA;
      const relatedEntry = entriesById.get(relatedEntryId);
      if (!relatedEntry || !isVisibleToActor(relatedEntry, actor)) return [];
      return [{
        entryId: relatedEntry.id,
        shortcut: relatedEntry.shortcut,
        conflictType: conflict.conflictType,
        context: conflict.context,
      }];
    });
    if (hints.length > 0) result.set(entryId, hints);
  }
  return result;
}
