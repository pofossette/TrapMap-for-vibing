/**
 * Internal helpers for skill artifact model: store lookups, actor refs,
 * and record-to-contract converters.
 */

import type { AgentReviewResult } from '@trapmap/contracts';

import type {
  AgentReviewRecord,
  SkillArtifactLifecycleEventRecord,
  SkillArtifactReviewDecisionRecord,
  SkillArtifactReviewNoteRecord,
  SkillArtifactRevisionRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';

/**
 * Get a user from the store data.
 */
export function getUser(data: StoreData, userId: string) {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  return user;
}

/**
 * Get membership level for a user in a team.
 */
export function getMembershipLevel(
  data: StoreData,
  userId: string,
  teamId: string | null,
  fallbackLevel: number,
) {
  if (!teamId) {
    return fallbackLevel;
  }
  return (
    data.memberships.find((candidate) => candidate.userId === userId && candidate.teamId === teamId)
      ?.securityLevel ?? fallbackLevel
  );
}

/**
 * Convert a user ID to an actor ref.
 */
export function toActorRef(
  data: StoreData,
  userId: string,
  teamId: string | null,
  fallbackLevel: number,
) {
  const user = getUser(data, userId);
  return {
    id: user.id,
    handle: user.handle,
    securityLevel: getMembershipLevel(data, userId, teamId, fallbackLevel),
  };
}

/**
 * Convert a server review decision to contract format.
 */
export function toReviewDecision(
  data: StoreData,
  record: SkillArtifactReviewDecisionRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    decidedAt: record.decidedAt,
    decidedBy: toActorRef(data, record.decidedByUserId, teamId, fallbackLevel),
    decision: record.decision,
    notes: record.notes,
  };
}

/**
 * Convert a server review note to contract format.
 */
export function toReviewNote(
  data: StoreData,
  record: SkillArtifactReviewNoteRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    authorType: record.authorType,
    author: record.authorUserId
      ? toActorRef(data, record.authorUserId, teamId, fallbackLevel)
      : null,
    message: record.message,
  };
}

/**
 * Convert a server lifecycle event to contract format.
 */
export function toLifecycleEvent(
  data: StoreData,
  record: SkillArtifactLifecycleEventRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    id: record.id,
    type: record.type,
    createdAt: record.createdAt,
    actor: record.actorUserId ? toActorRef(data, record.actorUserId, teamId, fallbackLevel) : null,
    submissionId: record.submissionId,
    revision: record.revision,
    state: record.state,
    note: record.note,
  };
}

/**
 * Convert a server revision record to contract format.
 */
export function toRevision(
  data: StoreData,
  record: SkillArtifactRevisionRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    revision: record.revision,
    sourceHash: record.sourceHash,
    files: record.files.map((f) => ({
      path: f.path,
      kind: f.kind,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
      source: f.source,
      includeInDerivation: f.includeInDerivation,
      activationOnly: f.activationOnly,
    })),
    submittedAt: record.submittedAt,
    submittedBy: toActorRef(data, record.submittedByUserId, teamId, fallbackLevel),
    scriptDescriptors: record.scriptDescriptors,
    derived: record.derived
      ? {
          profile: record.derived.profile,
          capsules: record.derived.capsules,
          clientManifest: record.derived.clientManifest,
          sourceHash: record.derived.sourceHash,
          derivedAt: record.derived.derivedAt,
        }
      : null,
  };
}

/**
 * Create a lifecycle event record.
 */
export function createLifecycleEvent(
  store: SkillShareerStore,
  data: StoreData,
  input: Omit<SkillArtifactLifecycleEventRecord, 'id'>,
): SkillArtifactLifecycleEventRecord {
  return {
    id: store.nextId(data, 'artifact_event'),
    ...input,
  };
}

/**
 * Convert agent review result to agent review record.
 */
export function toAgentReviewRecord(review: AgentReviewResult): AgentReviewRecord {
  return {
    status: review.status,
    duplicateRisk: review.duplicateRisk,
    correctnessRisk: review.correctnessRisk,
    completenessRisk: review.completenessRisk,
    checkedAt: review.checkedAt,
    notes: review.notes,
  };
}

/**
 * Create review notes from agent review result.
 */
export function toAgentReviewNotes(
  store: SkillShareerStore,
  data: StoreData,
  review: AgentReviewResult,
): SkillArtifactReviewNoteRecord[] {
  return review.notes.map((message) => ({
    id: store.nextId(data, 'artifact_note'),
    createdAt: review.checkedAt,
    authorType: 'agent',
    authorUserId: null,
    message,
  }));
}
