import type {
  GovernanceConflictEntry,
  GovernanceConflictReadPort,
  GovernanceConflictWorkflowPort,
} from '@trapmap/backend-core';
import type { ConflictRelation, ConflictType } from '@trapmap/contracts';
import { nowIso, prefixedId } from '@trapmap/lib';

const PROBLEM_OVERLAP_THRESHOLD = 0.3;
const SOLUTION_DIFF_THRESHOLD = 0.3;
const CONTRADICTORY_THRESHOLD = 0.8;
const ALTERNATIVE_THRESHOLD = 0.4;

export interface GovernanceConflictProjection {
  listByEntryIds(entryIds: string[]): Promise<ConflictRelation[]>;
  upsert(conflict: ConflictRelation): Promise<void>;
}

export interface GovernanceConflictJudgment {
  conflictType: ConflictType | 'none';
  resolution?: string;
}

export interface GovernanceConflictChat {
  isConfigured: boolean;
  judgeConflict(input: {
    current: { title: string; body: string };
    candidate: { title: string; body: string };
  }): Promise<GovernanceConflictJudgment | null>;
}

export interface GovernanceConflictWorkflowDeps {
  read: GovernanceConflictReadPort;
  projection: GovernanceConflictProjection;
  chat?: GovernanceConflictChat;
  createId?: () => string;
  now?: () => string;
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / new Set([...a, ...b]).size;
}

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

export function generateConflictContext(
  entryA: Pick<GovernanceConflictEntry, 'shortcut'>,
  entryB: Pick<GovernanceConflictEntry, 'shortcut'>,
  conflictType: ConflictType,
): string {
  const descriptions: Record<ConflictType, string> = {
    alternative: 'Different approaches to the same problem',
    contradictory: 'Opposing solutions for the same problem',
    superseded: 'Newer approach supersedes older one',
  };
  return `${descriptions[conflictType]}: "${entryA.shortcut}" vs "${entryB.shortcut}"`;
}

function relationKey(entryIdA: string, entryIdB: string): string {
  return `${entryIdA}\u0000${entryIdB}`;
}

function canonicalEntries(
  current: GovernanceConflictEntry,
  candidate: GovernanceConflictEntry,
): [GovernanceConflictEntry, GovernanceConflictEntry] {
  return current.id < candidate.id ? [current, candidate] : [candidate, current];
}

export function createGovernanceConflictWorkflow(
  deps: GovernanceConflictWorkflowDeps,
): GovernanceConflictWorkflowPort {
  const createId = deps.createId ?? (() => prefixedId('conflict'));
  const now = deps.now ?? nowIso;

  return {
    async detectConflicts({ entryId }) {
      const candidates = await deps.read.getApprovedConflictCandidates(entryId);
      if (!candidates) return { detectedCount: 0 };

      const entryIds = [
        candidates.entry.id,
        ...candidates.candidates.map((candidate) => candidate.id),
      ];
      const existingRelations = await deps.projection.listByEntryIds(entryIds);
      const existingPairs = new Set(
        existingRelations.map((relation) => relationKey(relation.entryIdA, relation.entryIdB)),
      );
      let detectedCount = 0;

      for (const candidate of candidates.candidates) {
        if (candidate.id === candidates.entry.id) continue;
        const [entryA, entryB] = canonicalEntries(candidates.entry, candidate);
        if (existingPairs.has(relationKey(entryA.id, entryB.id))) continue;

        const problemOverlap = overlapScore(
          tokenize(candidates.entry.shortcut),
          tokenize(candidate.shortcut),
        );
        if (problemOverlap < PROBLEM_OVERLAP_THRESHOLD) continue;

        const solutionDiff =
          1 - overlapScore(tokenize(candidates.entry.detail), tokenize(candidate.detail));
        let conflictType: ConflictType | null = null;
        let resolution: string | undefined;

        if (deps.chat?.isConfigured) {
          try {
            const judgment = await deps.chat.judgeConflict({
              current: { title: candidates.entry.shortcut, body: candidates.entry.detail },
              candidate: { title: candidate.shortcut, body: candidate.detail },
            });
            if (judgment && judgment.conflictType !== 'none') {
              conflictType = judgment.conflictType;
              resolution = judgment.resolution;
            }
          } catch {
            conflictType = null;
          }
        }

        conflictType ??= classifyConflict(problemOverlap, solutionDiff);
        if (!conflictType) continue;

        const baseContext = generateConflictContext(entryA, entryB, conflictType);
        const conflict: ConflictRelation = {
          id: createId(),
          entryIdA: entryA.id,
          entryIdB: entryB.id,
          conflictType,
          context: resolution ? `${baseContext} | Resolution: ${resolution}` : baseContext,
          problemOverlapScore: problemOverlap,
          solutionDiffScore: solutionDiff,
          detectedAt: now(),
        };
        await deps.projection.upsert(conflict);
        existingPairs.add(relationKey(entryA.id, entryB.id));
        detectedCount += 1;
      }

      return { detectedCount };
    },
  };
}
