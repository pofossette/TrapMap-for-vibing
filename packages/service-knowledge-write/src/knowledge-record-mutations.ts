import type {
  AgentReviewRecord,
  AgentReviewResult,
  Boundary,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeReviewNoteRecord,
  KnowledgeRevisionRecord,
  KnowledgeSubmission,
} from '@trapmap/contracts';

import { prefixedId } from '@trapmap/lib';

function toAgentNotes(review: AgentReviewResult): KnowledgeReviewNoteRecord[] {
  return review.notes.map((message) => ({
    id: prefixedId('sub'),
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
    id: prefixedId('sub'),
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
    id: prefixedId('sub'),
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

function createKnowledgeRevision(
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
