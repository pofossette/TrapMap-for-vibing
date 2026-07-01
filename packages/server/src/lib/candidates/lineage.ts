/**
 * Lineage management for candidate resolution.
 *
 * @module candidates/lineage
 */

import type { CandidateSubmission } from '@trapmap/contracts';
import type { LineageRepository } from '@trapmap/server/lib/lineage/index.js';
import type {
  EntityLineageRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';

/**
 * Record a merge lineage relationship between candidate and existing entity.
 * Does NOT modify the existing entity's content - only records the relationship.
 *
 * For more complex merge semantics (content merging), a future phase can extend this.
 */
export function recordMergeLineage(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidate: CandidateSubmission;
  existingEntityId: string;
  existingEntityType: 'trap' | 'skill';
  resolvedBy: string;
  resolvedAt: string;
  notes: string;
}): { lineage: EntityLineageRecord } {
  // Create lineage record
  const lineage: EntityLineageRecord = {
    id: args.store.nextId(args.data, 'lineage'),
    candidateId: args.candidate.id,
    relationshipType: 'merged_into',
    sourceType: 'candidate',
    sourceId: args.candidate.id,
    targetType: args.existingEntityType,
    targetId: args.existingEntityId,
    createdAt: args.resolvedAt,
    notes: args.notes,
  };

  // Lineage is returned for the caller to flush via LineageRepository.

  // Optionally add a review note to the existing entity (non-destructive)
  if (args.existingEntityType === 'trap') {
    const trap = args.data.knowledgeEntries.find((e) => e.id === args.existingEntityId);
    if (trap) {
      trap.reviewNotes.push({
        id: args.store.nextId(args.data, 'note'),
        createdAt: args.resolvedAt,
        authorType: 'system',
        authorUserId: null,
        message: `Duplicate candidate ${args.candidate.id} was merged into this entry. ${args.notes}`,
      });
      trap.updatedAt = args.resolvedAt;
    }
  } else if (args.existingEntityType === 'skill') {
    const skill = args.data.skillArtifacts.find((a) => a.id === args.existingEntityId);
    if (skill) {
      skill.reviewNotes.push({
        id: args.store.nextId(args.data, 'note'),
        createdAt: args.resolvedAt,
        authorType: 'system',
        authorUserId: null,
        message: `Duplicate candidate ${args.candidate.id} was merged into this artifact. ${args.notes}`,
      });
      skill.updatedAt = args.resolvedAt;
    }
  }

  return { lineage };
}

/**
 * Get all lineage records for a candidate.
 */
export async function getLineageByCandidate(
  lineageRepo: LineageRepository,
  candidateId: string,
): Promise<EntityLineageRecord[]> {
  return lineageRepo.listByCandidate(candidateId);
}

/**
 * Get all lineage records pointing to a specific entity.
 * Useful for seeing what candidates were merged into an entity.
 */
export async function getLineageByTarget(
  lineageRepo: LineageRepository,
  entityId: string,
  entityType: 'trap' | 'skill',
): Promise<EntityLineageRecord[]> {
  return lineageRepo.listByTarget(entityType, entityId);
}

/**
 * Get lineage record by ID.
 */
export async function getLineageById(
  lineageRepo: LineageRepository,
  lineageId: string,
): Promise<EntityLineageRecord | null> {
  return lineageRepo.getById(lineageId);
}
