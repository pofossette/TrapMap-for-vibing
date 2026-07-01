import { randomUUID } from 'node:crypto';
import {
  type AgentReviewResult,
  type Boundary,
  type EvidenceMeta,
  type KnowledgeResubmission,
  type KnowledgeSubmission,
  knowledgeEntrySchema,
  knowledgeListItemSchema,
} from '@trapmap/contracts';

import { AppError } from './errors.js';
import { createDefaultEvidenceMeta } from './evidence/model.js';
import { transitionLifecycleState } from './lifecycle/state-machine.js';
import type {
  AgentReviewRecord,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeReviewDecisionRecord,
  KnowledgeReviewNoteRecord,
  KnowledgeRevisionRecord,
  StoreData,
} from './store.js';

/**
 * Lightweight lookup context for knowledge serialization.
 * Carries only the data needed to resolve user handles and membership levels.
 *
 * Replaces the full StoreData dependency in toKnowledgeEntry and its helpers.
 * StoreData is structurally assignable to this type, so existing callers
 * passing StoreData continue to work without changes.
 */
export interface UserLookupContext {
  users: Array<{ id: string; handle: string }>;
  memberships: Array<{ userId: string; teamId: string; securityLevel: number }>;
}

/** Round 2: Build UserLookupContext from StoreData for callers that still use store_snapshot. */
function buildUserLookupFromStoreData(data: StoreData): UserLookupContext {
  return {
    users: data.users,
    memberships: data.memberships,
  };
}

/** Round 2: Internal sub-ID generator replacing store.nextId(). */
function nextSubId(): string {
  return randomUUID();
}

function getUser(data: UserLookupContext, userId: string) {
  const user = data.users.find((candidate) => candidate.id === userId);

  if (!user) {
    throw new AppError(404, 'user_not_found', 'User record not found');
  }

  return user;
}

function getMembershipLevel(
  data: UserLookupContext,
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

function toActorRef(
  data: UserLookupContext,
  userId: string,
  teamId: string | null,
  fallbackLevel: number,
) {
  if (userId === 'system-admin') {
    return {
      id: 'system-admin',
      handle: 'system-admin',
      securityLevel: 10,
    };
  }

  const user = getUser(data, userId);

  return {
    id: user.id,
    handle: user.handle,
    securityLevel: getMembershipLevel(data, userId, teamId, fallbackLevel),
  };
}

function toReviewDecision(
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

function toReviewNote(
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

function toRevision(
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

function toSubmissionRecord(
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

function toLifecycleEvent(data: UserLookupContext, record: KnowledgeRecord, fallbackLevel: number) {
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

function toAgentNotes(review: AgentReviewResult): KnowledgeReviewNoteRecord[] {
  return review.notes.map((message) => ({
    id: nextSubId(),
    createdAt: review.checkedAt,
    authorType: 'agent',
    authorUserId: null,
    message,
  }));
}

function createLifecycleEvent(
  input: Omit<KnowledgeLifecycleEventRecord, 'id'>,
): KnowledgeLifecycleEventRecord {
  return {
    id: nextSubId(),
    ...input,
  };
}

function createSubmissionRecord(input: {
  submittedByUserId: string;
  submittedAt: string;
  revision: number;
  lifecycleState: KnowledgeRecord['lifecycleState'];
  resubmissionOf: string | null;
  agentReview: AgentReviewRecord | null;
  reviewNotes?: KnowledgeReviewNoteRecord[];
}) {
  return {
    id: nextSubId(),
    revision: input.revision,
    submittedAt: input.submittedAt,
    submittedByUserId: input.submittedByUserId,
    lifecycleState: input.lifecycleState,
    resubmissionOf: input.resubmissionOf,
    agentReview: input.agentReview,
    reviewerDecision: null,
    reviewNotes: input.reviewNotes ?? [],
  };
}

export function createKnowledgeRevision(
  userId: string,
  input: {
    detail: string;
    labels: string[];
    shortcut: string;
  },
  revision: number,
  submittedAt: string,
  reviewNotes: KnowledgeReviewNoteRecord[] = [],
): KnowledgeRevisionRecord {
  return {
    revision,
    submittedAt,
    submittedByUserId: userId,
    shortcut: input.shortcut,
    detail: input.detail,
    labels: input.labels,
    reviewNotes,
  };
}

export function createKnowledgeEntryRecord(args: {
  ownerUserId: string;
  teamId: string | null;
  payload: KnowledgeSubmission;
  requiredLevel: number;
  createdAt: string;
  preReview: AgentReviewResult;
  boundary?: Boundary | null;
  /** Entry ID from repository (recommended). Falls back to randomUUID if not provided. */
  entryId: string;
}): KnowledgeRecord {
  const agentNotes = toAgentNotes(args.preReview);
  const revision = createKnowledgeRevision(
    args.ownerUserId,
    args.payload,
    1,
    args.createdAt,
    agentNotes,
  );
  const latestSubmission = createSubmissionRecord({
    submittedByUserId: args.ownerUserId,
    submittedAt: args.createdAt,
    revision: revision.revision,
    lifecycleState: args.preReview.status,
    resubmissionOf: null,
    agentReview: args.preReview,
    reviewNotes: agentNotes,
  });

  return {
    id: args.entryId,
    teamId: args.teamId,
    scope: args.payload.scope,
    labels: revision.labels,
    shortcut: revision.shortcut,
    detail: revision.detail,
    requiredLevel: args.requiredLevel,
    lifecycleState: args.preReview.status,
    ownerUserId: args.ownerUserId,
    latestRevision: revision,
    history: [revision],
    metadata: {
      scopeLabel: args.payload.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: latestSubmission.id,
      latestSubmittedAt: args.createdAt,
      latestReviewedAt: args.preReview.checkedAt,
      latestDecision: null,
    },
    latestSubmissionId: latestSubmission.id,
    submissionHistory: [latestSubmission],
    agentReview: args.preReview,
    reviewHistory: [],
    reviewNotes: agentNotes,
    lifecycleHistory: [
      createLifecycleEvent({
        type: 'submitted',
        createdAt: args.createdAt,
        actorUserId: args.ownerUserId,
        submissionId: latestSubmission.id,
        revision: 1,
        state: 'submitted',
        note: null,
      }),
      createLifecycleEvent({
        type: 'agent-reviewed',
        createdAt: args.preReview.checkedAt,
        actorUserId: null,
        submissionId: latestSubmission.id,
        revision: 1,
        state: args.preReview.status,
        note: args.preReview.notes[0] ?? null,
      }),
    ],
    embeddingCache: null,
    indexState: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: args.boundary ?? null,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  };
}

type ReviewEvidenceInput = Omit<EvidenceMeta, 'verifiedAt' | 'verifiedBy'> & {
  verifiedAt?: string;
  verifiedBy?: EvidenceMeta['verifiedBy'];
};

function resubmitKnowledgeEntry(args: {
  entry: KnowledgeRecord;
  ownerUserId: string;
  payload: KnowledgeResubmission;
  submittedAt: string;
  preReview: AgentReviewResult;
  boundary?: Boundary | null;
}): KnowledgeRecord {
  const previousSubmissionId = args.entry.latestSubmissionId;
  const revisionNumber = args.entry.history.length + 1;
  const agentNotes = toAgentNotes(args.preReview);
  const revision = createKnowledgeRevision(
    args.ownerUserId,
    args.payload,
    revisionNumber,
    args.submittedAt,
    agentNotes,
  );
  const latestSubmission = createSubmissionRecord({
    submittedByUserId: args.ownerUserId,
    submittedAt: args.submittedAt,
    revision: revisionNumber,
    lifecycleState: args.preReview.status,
    resubmissionOf: previousSubmissionId,
    agentReview: args.preReview,
    reviewNotes: agentNotes,
  });

  args.entry.labels = revision.labels;
  args.entry.shortcut = revision.shortcut;
  args.entry.detail = revision.detail;
  transitionLifecycleState(args.entry, args.preReview.status, 'resubmit agent review');
  args.entry.latestRevision = revision;
  args.entry.history.push(revision);
  args.entry.agentReview = args.preReview;
  args.entry.latestSubmissionId = latestSubmission.id;
  args.entry.submissionHistory.push(latestSubmission);
  args.entry.reviewNotes.push(...agentNotes);
  args.entry.metadata.submissionCount += 1;
  args.entry.metadata.resubmissionCount += 1;
  args.entry.metadata.revisionCount = args.entry.history.length;
  args.entry.metadata.latestSubmissionId = latestSubmission.id;
  args.entry.metadata.latestSubmittedAt = args.submittedAt;
  args.entry.metadata.latestReviewedAt = args.preReview.checkedAt;
  args.entry.metadata.latestDecision = null;
  args.entry.lifecycleHistory.push(
    createLifecycleEvent({
      type: 'resubmitted',
      createdAt: args.submittedAt,
      actorUserId: args.ownerUserId,
      submissionId: latestSubmission.id,
      revision: revisionNumber,
      state: 'submitted',
      note: previousSubmissionId ? `Resubmission of ${previousSubmissionId}` : null,
    }),
    createLifecycleEvent({
      type: 'agent-reviewed',
      createdAt: args.preReview.checkedAt,
      actorUserId: null,
      submissionId: latestSubmission.id,
      revision: revisionNumber,
      state: args.preReview.status,
      note: args.preReview.notes[0] ?? null,
    }),
  );
  args.entry.updatedAt = args.submittedAt;

  // Update boundary if provided, otherwise preserve existing
  if (args.boundary !== undefined) {
    args.entry.boundary = args.boundary;
  }

  return args.entry;
}

export function applyReviewDecision(args: {
  data: UserLookupContext;
  entry: KnowledgeRecord;
  reviewerUserId: string;
  decidedAt: string;
  decision: 'approve' | 'reject';
  notes: string;
  /** Optional evidence metadata from review input; server may fill verifier fields. */
  evidence?: ReviewEvidenceInput;
}): KnowledgeRecord {
  const reviewDecision: KnowledgeReviewDecisionRecord = {
    decidedAt: args.decidedAt,
    decidedByUserId: args.reviewerUserId,
    decision: args.decision,
    notes: args.notes,
  };
  const note: KnowledgeReviewNoteRecord = {
    id: nextSubId(),
    createdAt: args.decidedAt,
    authorType: 'reviewer',
    authorUserId: args.reviewerUserId,
    message: args.notes,
  };
  const latestSubmission = args.entry.submissionHistory.at(-1);

  args.entry.reviewHistory.push(reviewDecision);
  args.entry.reviewNotes.push(note);
  args.entry.latestRevision.reviewNotes.push(note);
  transitionLifecycleState(
    args.entry,
    args.decision === 'approve' ? 'approved' : 'rejected',
    'review decision',
  );

  // On approval, persist evidence metadata
  if (args.decision === 'approve') {
    // Always derive reviewer identity for verifiedBy override
    const reviewerActorRef = toActorRef(
      args.data,
      args.reviewerUserId,
      args.entry.teamId,
      args.entry.requiredLevel,
    );
    if (args.evidence) {
      args.entry.evidenceMeta = {
        ...args.evidence,
        verifiedAt: args.evidence.verifiedAt ?? args.decidedAt,
        // Always override verifiedBy with actual reviewer identity
        verifiedBy: reviewerActorRef,
      };
    } else {
      // Default evidence when not explicitly provided
      args.entry.evidenceMeta = createDefaultEvidenceMeta(args.decidedAt, reviewerActorRef);
    }
  }

  args.entry.metadata.latestReviewedAt = args.decidedAt;
  args.entry.metadata.latestDecision = args.decision;
  args.entry.lifecycleHistory.push(
    createLifecycleEvent({
      type: args.decision === 'approve' ? 'reviewer-approved' : 'reviewer-rejected',
      createdAt: args.decidedAt,
      actorUserId: args.reviewerUserId,
      submissionId: latestSubmission?.id ?? null,
      revision: args.entry.latestRevision.revision,
      state: args.entry.lifecycleState,
      note: args.notes,
    }),
  );

  if (latestSubmission) {
    latestSubmission.reviewerDecision = reviewDecision;
    latestSubmission.lifecycleState = args.entry.lifecycleState;
    latestSubmission.reviewNotes.push(note);
  }

  args.entry.updatedAt = args.decidedAt;

  return args.entry;
}

function updateKnowledgeEntry(args: {
  entry: KnowledgeRecord;
  modifierUserId: string;
  payload: {
    labels: string[];
    shortcut: string;
    detail: string;
    requiredLevel: number;
  };
  updatedAt: string;
}): KnowledgeRecord {
  const revision = createKnowledgeRevision(
    args.modifierUserId,
    args.payload,
    args.entry.history.length + 1,
    args.updatedAt,
  );

  args.entry.labels = revision.labels;
  args.entry.shortcut = revision.shortcut;
  args.entry.detail = revision.detail;
  args.entry.requiredLevel = args.payload.requiredLevel;
  args.entry.latestRevision = revision;
  args.entry.history.push(revision);
  args.entry.metadata.revisionCount = args.entry.history.length;
  args.entry.lifecycleHistory.push(
    createLifecycleEvent({
      type: 'updated',
      createdAt: args.updatedAt,
      actorUserId: args.modifierUserId,
      submissionId: args.entry.latestSubmissionId,
      revision: revision.revision,
      state: args.entry.lifecycleState,
      note: 'Privileged update applied',
    }),
  );
  args.entry.updatedAt = args.updatedAt;

  return args.entry;
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
