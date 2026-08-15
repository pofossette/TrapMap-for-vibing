import { type ReviewQueueProjectionAuth, filterReviewQueueEntries } from '@trapmap/backend-core';
import {
  type KnowledgeEntry,
  type KnowledgeOwnerPort,
  type KnowledgeRecord,
  type KnowledgeReviewDecisionRecord,
  type KnowledgeReviewNoteRecord,
  type KnowledgeRevisionRecord,
  type ReviewQueueItem,
  knowledgeEntrySchema,
} from '@trapmap/contracts';

export type { ReviewQueueProjectionAuth } from '@trapmap/backend-core';

interface UserRecord {
  id: string;
  handle: string;
}

interface MembershipRecord {
  userId: string;
  teamId: string;
  securityLevel: number;
}

interface UserLookupContext {
  users: UserRecord[];
  memberships: MembershipRecord[];
}

interface ReviewQueueRepos {
  knowledge: {
    listByFilter(filter: Record<string, unknown>): Promise<KnowledgeRecord[]>;
    getById(entryId: string): Promise<KnowledgeRecord | null>;
  };
  user: {
    getById(userId: string): Promise<UserRecord | null>;
  };
  membership: {
    findByUserAndTeam(userId: string, teamId: string): Promise<MembershipRecord | null>;
  };
}

export interface ReviewQueueProjection {
  items: ReviewQueueItem[];
  total: number;
}

export async function buildOwnerReviewQueueProjection(
  knowledge: Pick<KnowledgeOwnerPort, 'listByFilter'>,
  input: { auth: ReviewQueueProjectionAuth; status?: string },
): Promise<ReviewQueueProjection> {
  const entries = filterReviewQueueEntries(await knowledge.listByFilter({}), input);
  const items = entries.map((entry) => ({
    entry,
    agentReview: entry.agentReview,
    submittedBy: entry.latestSubmission?.submittedBy ?? entry.owner,
    latestSubmission: entry.latestSubmission,
    reviewNotes: entry.reviewNotes,
    lastDecision: entry.reviewHistory.at(-1) ?? null,
  }));

  return { items, total: items.length };
}

function collectActorIds(record: KnowledgeRecord): string[] {
  const ids = new Set<string>();
  ids.add(record.ownerUserId);

  for (const revision of record.history) {
    ids.add(revision.submittedByUserId);
  }
  for (const decision of record.reviewHistory) {
    ids.add(decision.decidedByUserId);
  }
  for (const note of record.reviewNotes) {
    if (note.authorUserId) {
      ids.add(note.authorUserId);
    }
  }
  for (const event of record.lifecycleHistory) {
    if (event.actorUserId) {
      ids.add(event.actorUserId);
    }
  }
  for (const submission of record.submissionHistory) {
    ids.add(submission.submittedByUserId);
    if (submission.reviewerDecision) {
      ids.add(submission.reviewerDecision.decidedByUserId);
    }
    for (const note of submission.reviewNotes) {
      if (note.authorUserId) {
        ids.add(note.authorUserId);
      }
    }
  }

  return [...ids];
}

async function buildUserLookupContextFromRepos(
  repos: Pick<ReviewQueueRepos, 'user' | 'membership'>,
  entries: KnowledgeRecord[],
): Promise<UserLookupContext> {
  const allActorIds = new Set<string>();
  const allPairs: Array<{ userId: string; teamId: string }> = [];

  for (const entry of entries) {
    for (const id of collectActorIds(entry)) {
      allActorIds.add(id);
    }
    if (entry.teamId) {
      for (const userId of collectActorIds(entry)) {
        allPairs.push({ userId, teamId: entry.teamId });
      }
    }
  }

  const users = await Promise.all([...allActorIds].map((id) => repos.user.getById(id)));
  const memberships = await Promise.all(
    allPairs.map(({ userId, teamId }) => repos.membership.findByUserAndTeam(userId, teamId)),
  );

  return {
    users: users.filter((user): user is UserRecord => user !== null),
    memberships: memberships.filter(
      (membership): membership is MembershipRecord => membership !== null,
    ),
  };
}

function getUser(data: UserLookupContext, userId: string): UserRecord {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`User record not found: ${userId}`);
  }
  return user;
}

function getMembershipLevel(
  data: UserLookupContext,
  userId: string,
  teamId: string | null,
  fallbackLevel: number,
): number {
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
    return { id: 'system-admin', handle: 'system-admin', securityLevel: 10 };
  }

  const user = getUser(data, userId);
  return {
    id: user.id,
    handle: user.handle,
    securityLevel: getMembershipLevel(data, userId, teamId, fallbackLevel),
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

function toSubmissionHistory(
  data: UserLookupContext,
  record: KnowledgeRecord,
): KnowledgeEntry['submissionHistory'] {
  return record.submissionHistory.map((submission) => ({
    id: submission.id,
    revision: submission.revision,
    submittedAt: submission.submittedAt,
    submittedBy: toActorRef(
      data,
      submission.submittedByUserId,
      record.teamId,
      record.requiredLevel,
    ),
    lifecycleState: submission.lifecycleState,
    resubmissionOf: submission.resubmissionOf,
    agentReview: submission.agentReview,
    reviewerDecision: submission.reviewerDecision
      ? toReviewDecision(data, submission.reviewerDecision, record.teamId, record.requiredLevel)
      : null,
    reviewNotes: submission.reviewNotes.map((note) =>
      toReviewNote(data, note, record.teamId, record.requiredLevel),
    ),
  }));
}

function toLifecycleHistory(data: UserLookupContext, record: KnowledgeRecord) {
  return record.lifecycleHistory.map((event) => ({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    actor: event.actorUserId
      ? toActorRef(data, event.actorUserId, record.teamId, record.requiredLevel)
      : null,
    submissionId: event.submissionId,
    revision: event.revision,
    state: event.state,
    note: event.note,
  }));
}

function toKnowledgeEntry(data: UserLookupContext, record: KnowledgeRecord): KnowledgeEntry {
  const submissionHistory = toSubmissionHistory(data, record);
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
    owner: toActorRef(data, record.ownerUserId, record.teamId, record.requiredLevel),
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
    lifecycleHistory: toLifecycleHistory(data, record),
    boundary: record.boundary,
    evidenceMeta: record.evidenceMeta,
    maintenanceMeta,
    remediation: record.remediation ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export async function buildReviewQueueProjection(
  repos: ReviewQueueRepos,
  input: { auth: ReviewQueueProjectionAuth; status?: string },
): Promise<ReviewQueueProjection> {
  const allEntries = await repos.knowledge.listByFilter({});
  const filteredEntries = filterReviewQueueEntries(allEntries, input);

  const fullEntries = await Promise.all(
    filteredEntries.map(
      async (entrySummary) => (await repos.knowledge.getById(entrySummary.id)) ?? entrySummary,
    ),
  );
  const lookup = await buildUserLookupContextFromRepos(repos, fullEntries);

  const items = (
    await Promise.all(
      fullEntries.map(async (entry): Promise<ReviewQueueItem | null> => {
        const owner = await repos.user.getById(entry.ownerUserId);
        if (!owner) {
          return null;
        }

        const lastDecision = entry.reviewHistory.at(-1) ?? null;
        const lastDecisionUserId = lastDecision?.decidedByUserId ?? owner.id;
        const lastDecisionUser =
          lastDecisionUserId === owner.id ? owner : await repos.user.getById(lastDecisionUserId);

        const serializedEntry = toKnowledgeEntry(lookup, entry);
        const latestSubmission = serializedEntry.latestSubmission;
        return {
          entry: serializedEntry,
          agentReview: entry.agentReview,
          submittedBy: latestSubmission?.submittedBy ?? serializedEntry.owner,
          latestSubmission,
          reviewNotes: serializedEntry.reviewNotes,
          lastDecision: lastDecision
            ? {
                decidedAt: lastDecision.decidedAt,
                decidedBy: {
                  id: lastDecisionUserId,
                  handle: lastDecisionUser?.handle ?? owner.handle,
                  securityLevel: entry.requiredLevel,
                },
                decision: lastDecision.decision,
                notes: lastDecision.notes,
              }
            : null,
        };
      }),
    )
  ).filter((item): item is ReviewQueueItem => item !== null);

  return {
    items,
    total: items.length,
  };
}
