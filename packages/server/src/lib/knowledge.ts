import {
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  type AgentReviewResult,
  type KnowledgeResubmission,
  type KnowledgeSubmission,
  type KnowledgeUpdate,
} from '@skill-shareer/contracts';

import { AppError } from './errors.js';
import type {
  AgentReviewRecord,
  JsonStore,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeReviewDecisionRecord,
  KnowledgeReviewNoteRecord,
  KnowledgeRevisionRecord,
  StoreData,
} from './store.js';

function getUser(data: StoreData, userId: string) {
  const user = data.users.find((candidate) => candidate.id === userId);

  if (!user) {
    throw new AppError(404, 'user_not_found', 'User record not found');
  }

  return user;
}

function getMembershipLevel(data: StoreData, userId: string, teamId: string | null, fallbackLevel: number) {
  if (!teamId) {
    return fallbackLevel;
  }

  return (
    data.memberships.find((candidate) => candidate.userId === userId && candidate.teamId === teamId)
      ?.securityLevel ?? fallbackLevel
  );
}

function toActorRef(data: StoreData, userId: string, teamId: string | null, fallbackLevel: number) {
  const user = getUser(data, userId);

  return {
    id: user.id,
    handle: user.handle,
    securityLevel: getMembershipLevel(data, userId, teamId, fallbackLevel),
  };
}

function toReviewDecision(
  data: StoreData,
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
  data: StoreData,
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
  data: StoreData,
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

function toSubmissionRecord(data: StoreData, record: KnowledgeRecord, fallbackLevel: number) {
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
    reviewNotes: submission.reviewNotes.map((note) => toReviewNote(data, note, record.teamId, fallbackLevel)),
  }));
}

function toLifecycleEvent(data: StoreData, record: KnowledgeRecord, fallbackLevel: number) {
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

function toAgentNotes(
  store: JsonStore,
  data: StoreData,
  review: AgentReviewResult,
): KnowledgeReviewNoteRecord[] {
  return review.notes.map((message) => ({
    id: store.nextId(data, 'note'),
    createdAt: review.checkedAt,
    authorType: 'agent',
    authorUserId: null,
    message,
  }));
}

function createLifecycleEvent(
  store: JsonStore,
  data: StoreData,
  input: Omit<KnowledgeLifecycleEventRecord, 'id'>,
): KnowledgeLifecycleEventRecord {
  return {
    id: store.nextId(data, 'knowledge_event'),
    ...input,
  };
}

function createSubmissionRecord(
  store: JsonStore,
  data: StoreData,
  input: {
    submittedByUserId: string;
    submittedAt: string;
    revision: number;
    lifecycleState: KnowledgeRecord['lifecycleState'];
    resubmissionOf: string | null;
    agentReview: AgentReviewRecord | null;
    reviewNotes?: KnowledgeReviewNoteRecord[];
  },
) {
  return {
    id: store.nextId(data, 'submission'),
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
  store: JsonStore;
  data: StoreData;
  ownerUserId: string;
  teamId: string | null;
  payload: KnowledgeSubmission;
  requiredLevel: number;
  createdAt: string;
  preReview: AgentReviewResult;
}): KnowledgeRecord {
  const agentNotes = toAgentNotes(args.store, args.data, args.preReview);
  const revision = createKnowledgeRevision(args.ownerUserId, args.payload, 1, args.createdAt, agentNotes);
  const latestSubmission = createSubmissionRecord(args.store, args.data, {
    submittedByUserId: args.ownerUserId,
    submittedAt: args.createdAt,
    revision: revision.revision,
    lifecycleState: args.preReview.status,
    resubmissionOf: null,
    agentReview: args.preReview,
    reviewNotes: agentNotes,
  });

  return {
    id: args.store.nextId(args.data, 'knowledge'),
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
      createLifecycleEvent(args.store, args.data, {
        type: 'submitted',
        createdAt: args.createdAt,
        actorUserId: args.ownerUserId,
        submissionId: latestSubmission.id,
        revision: 1,
        state: 'submitted',
        note: null,
      }),
      createLifecycleEvent(args.store, args.data, {
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
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  };
}

export function resubmitKnowledgeEntry(args: {
  store: JsonStore;
  data: StoreData;
  entry: KnowledgeRecord;
  ownerUserId: string;
  payload: KnowledgeResubmission;
  submittedAt: string;
  preReview: AgentReviewResult;
}): KnowledgeRecord {
  const previousSubmissionId = args.entry.latestSubmissionId;
  const revisionNumber = args.entry.history.length + 1;
  const agentNotes = toAgentNotes(args.store, args.data, args.preReview);
  const revision = createKnowledgeRevision(
    args.ownerUserId,
    args.payload,
    revisionNumber,
    args.submittedAt,
    agentNotes,
  );
  const latestSubmission = createSubmissionRecord(args.store, args.data, {
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
  args.entry.lifecycleState = args.preReview.status;
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
    createLifecycleEvent(args.store, args.data, {
      type: 'resubmitted',
      createdAt: args.submittedAt,
      actorUserId: args.ownerUserId,
      submissionId: latestSubmission.id,
      revision: revisionNumber,
      state: 'submitted',
      note: previousSubmissionId ? `Resubmission of ${previousSubmissionId}` : null,
    }),
    createLifecycleEvent(args.store, args.data, {
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

  return args.entry;
}

export function applyReviewDecision(args: {
  store: JsonStore;
  data: StoreData;
  entry: KnowledgeRecord;
  reviewerUserId: string;
  decidedAt: string;
  decision: 'approve' | 'reject';
  notes: string;
}): KnowledgeRecord {
  const reviewDecision: KnowledgeReviewDecisionRecord = {
    decidedAt: args.decidedAt,
    decidedByUserId: args.reviewerUserId,
    decision: args.decision,
    notes: args.notes,
  };
  const note: KnowledgeReviewNoteRecord = {
    id: args.store.nextId(args.data, 'note'),
    createdAt: args.decidedAt,
    authorType: 'reviewer',
    authorUserId: args.reviewerUserId,
    message: args.notes,
  };
  const latestSubmission = args.entry.submissionHistory.at(-1);

  args.entry.reviewHistory.push(reviewDecision);
  args.entry.reviewNotes.push(note);
  args.entry.latestRevision.reviewNotes.push(note);
  args.entry.lifecycleState = args.decision === 'approve' ? 'approved' : 'rejected';
  args.entry.metadata.latestReviewedAt = args.decidedAt;
  args.entry.metadata.latestDecision = args.decision;
  args.entry.lifecycleHistory.push(
    createLifecycleEvent(args.store, args.data, {
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

export function updateKnowledgeEntry(args: {
  store: JsonStore;
  data: StoreData;
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
    createLifecycleEvent(args.store, args.data, {
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

export function toKnowledgeEntry(data: StoreData, record: KnowledgeRecord) {
  const owner = toActorRef(data, record.ownerUserId, record.teamId, record.requiredLevel);
  const submissionHistory = toSubmissionRecord(data, record, record.requiredLevel);

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
    history: record.history.map((revision) => toRevision(data, revision, record.teamId, record.requiredLevel)),
    metadata: record.metadata,
    latestSubmission: submissionHistory.at(-1) ?? null,
    submissionHistory,
    agentReview: record.agentReview,
    reviewHistory: record.reviewHistory.map((decision) =>
      toReviewDecision(data, decision, record.teamId, record.requiredLevel),
    ),
    reviewNotes: record.reviewNotes.map((note) => toReviewNote(data, note, record.teamId, record.requiredLevel)),
    lifecycleHistory: toLifecycleEvent(data, record, record.requiredLevel),
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
  });
}
