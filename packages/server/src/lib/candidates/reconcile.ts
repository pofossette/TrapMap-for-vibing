import type { CandidateSubmission, ManualResultSubmission } from '@trapmap/contracts';
import type { StoreData, KnowledgeRecord, SkillArtifactRecord, EntityLineageRecord } from '../store.js';
import type { JsonStore } from '../store.js';
import { getCandidateById } from './store.js';

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
export function revalidateManualResult(
  data: StoreData,
  candidateId: string,
): RevalidationResult {
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
      const existingTrap = data.knowledgeEntries.find(e => e.id === entityId);
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
      const existingSkill = data.skillArtifacts.find(a => a.id === entityId);
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
  store: JsonStore;
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
  store: JsonStore;
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
      files: skillPayload.files.map(f => ({
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
