import { knowledgeEntrySchema, knowledgeListItemSchema } from '@trapmap/contracts';

import type {
  KnowledgeRecord,
  KnowledgeReviewDecisionRecord,
  KnowledgeReviewNoteRecord,
  KnowledgeRevisionRecord,
} from '@trapmap/server/lib/store.js';
import { type UserLookupContext, toActorRef } from './actor-ref.js';

export function toReviewDecision(
  data: UserLookupContext,
  record: KnowledgeReviewDecisionRecord,
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

export function toReviewNote(
  data: UserLookupContext,
  record: KnowledgeReviewNoteRecord,
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

export function toRevision(
  data: UserLookupContext,
  record: KnowledgeRevisionRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    revision: record.revision,
    submittedAt: record.submittedAt,
    submittedBy: toActorRef(data, record.submittedByUserId, teamId, fallbackLevel),
    shortcut: record.shortcut,
    detail: record.detail,
    labels: record.labels,
    reviewNotes: record.reviewNotes.map((note) => toReviewNote(data, note, teamId, fallbackLevel)),
  };
}

export function toSubmissionRecord(
  data: UserLookupContext,
  record: KnowledgeRecord,
  fallbackLevel: number,
) {
  return record.submissionHistory.map((submission) => ({
    id: submission.id,
    revision: submission.revision,
    submittedAt: submission.submittedAt,
    submittedBy: toActorRef(data, submission.submittedByUserId, record.teamId, fallbackLevel),
    lifecycleState: submission.lifecycleState,
    resubmissionOf: submission.resubmissionOf,
    agentReview: submission.agentReview,
    reviewerDecision: submission.reviewerDecision
      ? toReviewDecision(data, submission.reviewerDecision, record.teamId, fallbackLevel)
      : null,
    reviewNotes: submission.reviewNotes.map((note) =>
      toReviewNote(data, note, record.teamId, fallbackLevel),
    ),
  }));
}

export function toLifecycleEvent(
  data: UserLookupContext,
  record: KnowledgeRecord,
  fallbackLevel: number,
) {
  return record.lifecycleHistory.map((event) => ({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    actor: event.actorUserId
      ? toActorRef(data, event.actorUserId, record.teamId, fallbackLevel)
      : null,
    submissionId: event.submissionId,
    revision: event.revision,
    state: event.state,
    note: event.note,
  }));
}

export function toKnowledgeEntry(data: UserLookupContext, record: KnowledgeRecord) {
  const owner = toActorRef(data, record.ownerUserId, record.teamId, record.requiredLevel);
  const submissionHistory = toSubmissionRecord(data, record, record.requiredLevel);

  // Convert MaintenanceMetaRecord to MaintenanceMeta format
  const maintenanceMeta = record.maintenanceMeta
    ? {
        maintainer: record.maintenanceMeta.maintainerUserId
          ? {
              id: record.maintenanceMeta.maintainerUserId,
              handle: record.maintenanceMeta.maintainerHandle ?? '',
              securityLevel: record.maintenanceMeta.maintainerLevel ?? record.requiredLevel,
            }
          : null,
        reviewBy: record.maintenanceMeta.reviewBy,
      }
    : null;

  return knowledgeEntrySchema.parse({
    id: record.id,
    teamId: record.teamId,
    scope: record.scope,
    labels: record.labels,
    shortcut: record.shortcut,
    detail: record.detail,
    requiredLevel: record.requiredLevel,
    lifecycleState: record.lifecycleState,
    owner,
    latestRevision: toRevision(data, record.latestRevision, record.teamId, record.requiredLevel),
    history: record.history.map((revision) =>
      toRevision(data, revision, record.teamId, record.requiredLevel),
    ),
    metadata: record.metadata,
    latestSubmission: submissionHistory.at(-1) ?? null,
    submissionHistory,
    agentReview: record.agentReview,
    reviewHistory: record.reviewHistory.map((decision) =>
      toReviewDecision(data, decision, record.teamId, record.requiredLevel),
    ),
    reviewNotes: record.reviewNotes.map((note) =>
      toReviewNote(data, note, record.teamId, record.requiredLevel),
    ),
    lifecycleHistory: toLifecycleEvent(data, record, record.requiredLevel),
    evidenceMeta: record.evidenceMeta,
    maintenanceMeta,
    remediation: record.remediation ?? null,
    boundary: record.boundary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toKnowledgeListItem(record: KnowledgeRecord) {
  return knowledgeListItemSchema.parse({
    id: record.id,
    scope: record.scope,
    labels: record.labels,
    shortcut: record.shortcut,
    lifecycleState: record.lifecycleState,
    requiredLevel: record.requiredLevel,
    updatedAt: record.updatedAt,
    evidenceMeta: record.evidenceMeta,
  });
}
