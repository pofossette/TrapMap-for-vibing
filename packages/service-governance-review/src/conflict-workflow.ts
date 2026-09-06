import type {
  GovernanceConflictReadPort,
  GovernanceConflictWorkflowPort,
} from '@trapmap/backend-core';
import {
  canonicalEntries,
  classifyConflict,
  generateConflictContext,
  overlapScore,
  PROBLEM_OVERLAP_THRESHOLD,
  relationKey,
  tokenize,
} from '@trapmap/backend-core';
import type { ConflictRelation, ConflictType } from '@trapmap/contracts';
import { nowIso, prefixedId } from '@trapmap/lib';

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

export { classifyConflict, generateConflictContext, overlapScore, tokenize };

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
