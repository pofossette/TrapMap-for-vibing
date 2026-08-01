import type {
  AgentReviewResult,
  Boundary,
  EvidenceMeta,
  KnowledgeResubmission,
  KnowledgeSubmission,
} from '@trapmap/contracts';

import type {
  AgentReviewRecord,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeReviewDecisionRecord,
  KnowledgeReviewNoteRecord,
  KnowledgeRevisionRecord,
} from '@trapmap/service-knowledge-read/store.js';
import { toActorRef } from './knowledge-deps/actor-ref.js';
import type { UserLookupContext } from './knowledge-deps/actor-ref.js';
import { createDefaultEvidenceMeta } from './knowledge-deps/evidence-model.js';
import { transitionLifecycleState } from './knowledge-deps/lifecycle-index.js';
import { nextSubId } from './knowledge-deps/next-sub-id.js';

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

export function resubmitKnowledgeEntry(args: {
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

type ReviewEvidenceInput = Omit<EvidenceMeta, 'verifiedAt' | 'verifiedBy'> & {
  verifiedAt?: string;
  verifiedBy?: EvidenceMeta['verifiedBy'];
};

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

export function updateKnowledgeEntry(args: {
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
