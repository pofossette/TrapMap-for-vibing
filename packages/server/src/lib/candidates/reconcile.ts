import type {
  CandidateSubmission,
  ManualResultSubmission,
  ResolutionOutcome,
} from '@trapmap/contracts';
import type { ResolvedAuthContext } from '../context.js';
import type {
  EntityLineageRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
  SkillShareerStore,
  StoreData,
} from '../store.js';
import { nowIso } from '../store.js';
import { getCandidateById, markCandidateResolved } from './store.js';

/**
 * Validation result for a manual result before resolution.
 */
export interface RevalidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
  };
  candidate?: CandidateSubmission;
  existingTrap?: KnowledgeRecord;
  existingSkill?: SkillArtifactRecord;
}

/**
 * Error codes for revalidation failures.
 */
export const REVALIDATION_ERRORS = {
  CANDIDATE_NOT_FOUND: 'candidate_not_found',
  INVALID_STATUS: 'invalid_candidate_status',
  NO_MANUAL_RESULT: 'no_manual_result',
  MERGE_TARGET_NOT_FOUND: 'merge_target_not_found',
  MERGE_TARGET_INCOMPATIBLE: 'merge_target_incompatible',
  ALREADY_RESOLVED: 'already_resolved',
} as const;

/**
 * Revalidate a manual result before applying resolution.
 *
 * Checks:
 * 1. Candidate exists
 * 2. Candidate is in 'duplicate_detected' status
 * 3. Manual result is attached
 * 4. For 'merged' decision: target entity exists and is not deactivated
 *
 * @param data - Store data snapshot
 * @param candidateId - ID of the candidate to validate
 * @returns RevalidationResult with validation status and any error details
 */
export function revalidateManualResult(data: StoreData, candidateId: string): RevalidationResult {
  // 1. Check candidate exists
  const candidate = getCandidateById(data, candidateId);
  if (!candidate) {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.CANDIDATE_NOT_FOUND,
        message: `Candidate ${candidateId} not found`,
      },
    };
  }

  // 2. Check candidate is not already resolved
  if (candidate.status === 'resolved') {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.ALREADY_RESOLVED,
        message: `Candidate ${candidateId} is already resolved`,
      },
      candidate,
    };
  }

  // 3. Check candidate is in duplicate_detected status
  if (candidate.status !== 'duplicate_detected') {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.INVALID_STATUS,
        message: `Candidate ${candidateId} is not in duplicate_detected status (current: ${candidate.status})`,
      },
      candidate,
    };
  }

  // 4. Check manual result is attached
  if (!candidate.manualResult) {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.NO_MANUAL_RESULT,
        message: `Candidate ${candidateId} has no manual result attached`,
      },
      candidate,
    };
  }

  // 5. For merged decision, verify target entity exists and is compatible
  if (candidate.manualResult.decision === 'merged' && candidate.manualResult.mergedWith) {
    const { entityType, entityId } = candidate.manualResult.mergedWith;

    if (entityType === 'trap') {
      const existingTrap = data.knowledgeEntries.find((e) => e.id === entityId);
      if (!existingTrap) {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_NOT_FOUND,
            message: `Merge target trap ${entityId} not found`,
          },
          candidate,
        };
      }
      if (existingTrap.lifecycleState === 'deactivated') {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_INCOMPATIBLE,
            message: `Merge target trap ${entityId} is deactivated`,
          },
          candidate,
          existingTrap,
        };
      }
      return { valid: true, candidate, existingTrap };
    }

    if (entityType === 'skill') {
      const existingSkill = data.skillArtifacts.find((a) => a.id === entityId);
      if (!existingSkill) {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_NOT_FOUND,
            message: `Merge target skill ${entityId} not found`,
          },
          candidate,
        };
      }
      if (existingSkill.lifecycleState === 'deactivated') {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_INCOMPATIBLE,
            message: `Merge target skill ${entityId} is deactivated`,
          },
          candidate,
          existingSkill,
        };
      }
      return { valid: true, candidate, existingSkill };
    }
  }

  return { valid: true, candidate };
}

/**
 * Check if a candidate can be idempotently resolved.
 * Returns true if already resolved with a matching manual result.
 */
export function isAlreadyResolved(
  candidate: CandidateSubmission,
  manualResult: ManualResultSubmission,
): boolean {
  if (candidate.status !== 'resolved') {
    return false;
  }

  // If already resolved, check if the manual result matches
  if (candidate.manualResult) {
    return (
      candidate.manualResult.decision === manualResult.decision &&
      candidate.manualResult.notes === manualResult.notes
    );
  }

  return false;
}

/**
 * Create a KnowledgeRecord from a trap candidate.
 * The new entry starts at 'agent-pass' lifecycle state.
 */
export function publishTrapCandidate(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidate: CandidateSubmission;
  resolvedBy: string;
  resolvedAt: string;
}): { entry: KnowledgeRecord; lineage: EntityLineageRecord } {
  if (!args.candidate.originalPayload.trap) {
    throw new Error('Candidate has no trap payload');
  }

  const trapPayload = args.candidate.originalPayload.trap;

  // Create the knowledge entry with agent-pass state
  // (candidate already passed duplicate analysis, but needs reviewer approval)
  const entry: KnowledgeRecord = {
    id: args.store.nextId(args.data, 'knowledge'),
    teamId: args.candidate.teamId,
    scope: trapPayload.scope,
    labels: trapPayload.labels,
    shortcut: trapPayload.shortcut,
    detail: trapPayload.detail,
    requiredLevel: trapPayload.requiredLevel ?? 0,
    lifecycleState: 'agent-pass',
    ownerUserId: args.candidate.submittedBy,
    latestRevision: {
      revision: 1,
      submittedAt: args.resolvedAt,
      submittedByUserId: args.candidate.submittedBy,
      shortcut: trapPayload.shortcut,
      detail: trapPayload.detail,
      labels: trapPayload.labels,
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: trapPayload.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: args.resolvedAt,
      latestReviewedAt: args.resolvedAt,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'low',
      checkedAt: args.resolvedAt,
      notes: ['Published from candidate submission after duplicate review'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [
      {
        id: args.store.nextId(args.data, 'knowledge_event'),
        type: 'submitted',
        createdAt: args.resolvedAt,
        actorUserId: args.candidate.submittedBy,
        submissionId: null,
        revision: 1,
        state: 'submitted',
        note: 'Published from candidate after duplicate resolution',
      },
      {
        id: args.store.nextId(args.data, 'knowledge_event'),
        type: 'agent-reviewed',
        createdAt: args.resolvedAt,
        actorUserId: null,
        submissionId: null,
        revision: 1,
        state: 'agent-pass',
        note: 'Auto-approved after duplicate resolution',
      },
    ],
    embeddingCache: null,
    indexState: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: args.resolvedAt,
    updatedAt: args.resolvedAt,
  };

  // Push to knowledge entries
  args.data.knowledgeEntries.push(entry);

  // Create lineage record
  const lineage: EntityLineageRecord = {
    id: args.store.nextId(args.data, 'lineage'),
    candidateId: args.candidate.id,
    relationshipType: 'published_as',
    sourceType: 'candidate',
    sourceId: args.candidate.id,
    targetType: 'trap',
    targetId: entry.id,
    createdAt: args.resolvedAt,
    notes: 'Published as independent trap after duplicate resolution',
  };

  args.data.entityLineage.push(lineage);

  return { entry, lineage };
}

/**
 * Create a SkillArtifactRecord from a skill candidate.
 * The new artifact starts at 'agent-pass' lifecycle state.
 */
export function publishSkillCandidate(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidate: CandidateSubmission;
  resolvedBy: string;
  resolvedAt: string;
}): { artifact: SkillArtifactRecord; lineage: EntityLineageRecord } {
  if (!args.candidate.originalPayload.skill) {
    throw new Error('Candidate has no skill payload');
  }

  const skillPayload = args.candidate.originalPayload.skill;

  // Create skill artifact with agent-pass state
  const artifact: SkillArtifactRecord = {
    id: args.store.nextId(args.data, 'artifact'),
    teamId: args.candidate.teamId,
    scope: 'global', // Default scope for skills
    labels: skillPayload.metadata.labels,
    title: skillPayload.metadata.title || 'Untitled Skill',
    slug: skillPayload.metadata.slug || `skill-${Date.now()}`,
    requiredLevel: 0,
    lifecycleState: 'agent-pass',
    ownerUserId: args.candidate.submittedBy,
    latestRevision: {
      revision: 1,
      sourceHash: '', // Will be computed from files
      files: skillPayload.files.map((f) => ({
        path: f.path,
        kind: 'skill-markdown' as const,
        sha256: f.sha256,
        sizeBytes: f.sizeBytes,
        mediaType: f.mediaType,
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      })),
      submittedAt: args.resolvedAt,
      submittedByUserId: args.candidate.submittedBy,
      scriptDescriptors: [],
      derived: null,
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: args.resolvedAt,
      latestReviewedAt: args.resolvedAt,
      latestDecision: null,
    },
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'low',
      checkedAt: args.resolvedAt,
      notes: ['Published from candidate submission after duplicate review'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [
      {
        id: args.store.nextId(args.data, 'artifact_event'),
        type: 'submitted',
        createdAt: args.resolvedAt,
        actorUserId: args.candidate.submittedBy,
        submissionId: null,
        revision: 1,
        state: 'submitted',
        note: 'Published from candidate after duplicate resolution',
      },
      {
        id: args.store.nextId(args.data, 'artifact_event'),
        type: 'agent-reviewed',
        createdAt: args.resolvedAt,
        actorUserId: null,
        submissionId: null,
        revision: 1,
        state: 'agent-pass',
        note: 'Auto-approved after duplicate resolution',
      },
    ],
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: args.resolvedAt,
    updatedAt: args.resolvedAt,
  };

  // Push to skill artifacts
  args.data.skillArtifacts.push(artifact);

  // Create lineage record
  const lineage: EntityLineageRecord = {
    id: args.store.nextId(args.data, 'lineage'),
    candidateId: args.candidate.id,
    relationshipType: 'published_as',
    sourceType: 'candidate',
    sourceId: args.candidate.id,
    targetType: 'skill',
    targetId: artifact.id,
    createdAt: args.resolvedAt,
    notes: 'Published as independent skill after duplicate resolution',
  };

  args.data.entityLineage.push(lineage);

  return { artifact, lineage };
}

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

  args.data.entityLineage.push(lineage);

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
export function getLineageByCandidate(data: StoreData, candidateId: string): EntityLineageRecord[] {
  return data.entityLineage.filter((l) => l.candidateId === candidateId);
}

/**
 * Get all lineage records pointing to a specific entity.
 * Useful for seeing what candidates were merged into an entity.
 */
export function getLineageByTarget(
  data: StoreData,
  entityId: string,
  entityType: 'trap' | 'skill',
): EntityLineageRecord[] {
  return data.entityLineage.filter((l) => l.targetId === entityId && l.targetType === entityType);
}

/**
 * Result of applying a manual resolution.
 */
export interface ApplyResolutionResult {
  success: boolean;
  candidate: CandidateSubmission | undefined;
  outcome: ResolutionOutcome | undefined;
  lineage: EntityLineageRecord | undefined;
  error:
    | {
        code: string;
        message: string;
      }
    | undefined;
}

/**
 * Main orchestrator for applying a manual resolution.
 *
 * Steps:
 * 1. Revalidate the manual result
 * 2. If 'independent': publish as new entity
 * 3. If 'merged': record lineage to existing entity
 * 4. Mark candidate as resolved
 *
 * Idempotent: if already resolved with same decision, returns success without re-processing.
 */
export function applyManualResultResolution(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidateId: string;
  actor: ResolvedAuthContext;
}): ApplyResolutionResult {
  const resolvedAt = nowIso();
  const resolvedBy = args.actor.user?.id;

  if (!resolvedBy) {
    return {
      success: false,
      error: {
        code: 'user_required',
        message: 'Resolution requires a real user account',
      },
      candidate: undefined,
      outcome: undefined,
      lineage: undefined,
    };
  }

  // Step 1: Revalidate
  const revalidation = revalidateManualResult(args.data, args.candidateId);

  // Handle idempotency - if already resolved, return success
  if (!revalidation.valid && revalidation.error?.code === REVALIDATION_ERRORS.ALREADY_RESOLVED) {
    const candidate = revalidation.candidate!;
    const existingLineage = getLineageByCandidate(args.data, candidate.id)[0];
    return {
      success: true,
      candidate,
      outcome: {
        candidateId: candidate.id,
        decision: candidate.manualResult!.decision,
        publishedEntityId:
          existingLineage?.relationshipType === 'published_as' ? existingLineage.targetId : null,
        mergedIntoEntityId:
          existingLineage?.relationshipType === 'merged_into' ? existingLineage.targetId : null,
        entityType: existingLineage?.targetType ?? null,
        resolvedAt: candidate.manualResult!.submittedAt,
        resolvedBy: candidate.manualResult!.submittedBy,
        notes: candidate.manualResult!.notes,
      },
      lineage: existingLineage,
      error: undefined,
    };
  }

  if (!revalidation.valid) {
    return {
      success: false,
      error: revalidation.error,
      candidate: undefined,
      outcome: undefined,
      lineage: undefined,
    };
  }

  const candidate = revalidation.candidate!;

  const manualResult = candidate.manualResult!;

  // Step 2 & 3: Apply decision
  let outcome: ResolutionOutcome;
  let lineage: EntityLineageRecord;

  if (manualResult.decision === 'independent') {
    // Publish as new entity
    if (candidate.sourceType === 'trap') {
      const result = publishTrapCandidate({
        store: args.store,
        data: args.data,
        candidate,
        resolvedBy,
        resolvedAt,
      });
      lineage = result.lineage;
      outcome = {
        candidateId: candidate.id,
        decision: 'independent',
        publishedEntityId: result.entry.id,
        mergedIntoEntityId: null,
        entityType: 'trap',
        resolvedAt,
        resolvedBy,
        notes: manualResult.notes,
      };
    } else {
      const result = publishSkillCandidate({
        store: args.store,
        data: args.data,
        candidate,
        resolvedBy,
        resolvedAt,
      });
      lineage = result.lineage;
      outcome = {
        candidateId: candidate.id,
        decision: 'independent',
        publishedEntityId: result.artifact.id,
        mergedIntoEntityId: null,
        entityType: 'skill',
        resolvedAt,
        resolvedBy,
        notes: manualResult.notes,
      };
    }
  } else {
    // Merged decision
    const mergedWith = manualResult.mergedWith!;
    const result = recordMergeLineage({
      store: args.store,
      data: args.data,
      candidate,
      existingEntityId: mergedWith.entityId,
      existingEntityType: mergedWith.entityType,
      resolvedBy,
      resolvedAt,
      notes: manualResult.notes,
    });
    lineage = result.lineage;
    outcome = {
      candidateId: candidate.id,
      decision: 'merged',
      publishedEntityId: null,
      mergedIntoEntityId: mergedWith.entityId,
      entityType: mergedWith.entityType,
      resolvedAt,
      resolvedBy,
      notes: manualResult.notes,
    };
  }

  // Step 4: Mark candidate as resolved
  markCandidateResolved({
    data: args.data,
    candidateId: candidate.id,
    resolvedBy,
  });

  return {
    success: true,
    candidate,
    outcome,
    lineage,
    error: undefined,
  };
}

/**
 * Get lineage record by ID.
 */
export function getLineageById(data: StoreData, lineageId: string): EntityLineageRecord | null {
  return data.entityLineage.find((l) => l.id === lineageId) ?? null;
}
