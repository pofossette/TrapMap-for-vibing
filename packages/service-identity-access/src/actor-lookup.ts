export interface IdentityActorLookupSource {
  getUsersByIds(userIds: string[]): Promise<Array<{ id: string; handle: string }>>;
  getMembershipLevels(
    pairs: Array<{ userId: string; teamId: string }>,
  ): Promise<Map<string, number>>;
}

export interface ActorReferencedKnowledge {
  ownerUserId: string;
  teamId?: string | null;
  history: Array<{ submittedByUserId: string }>;
  reviewHistory: Array<{ decidedByUserId: string }>;
  reviewNotes: Array<{ authorUserId?: string | null }>;
  lifecycleHistory: Array<{ actorUserId?: string | null }>;
  submissionHistory: Array<{
    submittedByUserId: string;
    reviewerDecision?: { decidedByUserId: string } | null;
    reviewNotes: Array<{ authorUserId?: string | null }>;
  }>;
}

export interface IdentityUserLookupContext {
  users: Array<{ id: string; handle: string }>;
  memberships: Array<{ userId: string; teamId: string; securityLevel: number }>;
}

function addPresentActorIds(ids: Set<string>, actorIds: Array<string | null | undefined>) {
  for (const actorId of actorIds) {
    if (actorId) ids.add(actorId);
  }
}

function addSubmissionActorIds(
  ids: Set<string>,
  submissions: ActorReferencedKnowledge['submissionHistory'],
) {
  for (const submission of submissions) {
    addPresentActorIds(ids, [
      submission.submittedByUserId,
      submission.reviewerDecision?.decidedByUserId,
      ...submission.reviewNotes.map((note) => note.authorUserId),
    ]);
  }
}

export function collectIdentityActorIds(record: ActorReferencedKnowledge): string[] {
  const ids = new Set([record.ownerUserId]);
  addPresentActorIds(
    ids,
    record.history.map((revision) => revision.submittedByUserId),
  );
  addPresentActorIds(
    ids,
    record.reviewHistory.map((decision) => decision.decidedByUserId),
  );
  addPresentActorIds(
    ids,
    record.reviewNotes.map((note) => note.authorUserId),
  );
  addPresentActorIds(
    ids,
    record.lifecycleHistory.map((event) => event.actorUserId),
  );
  addSubmissionActorIds(ids, record.submissionHistory);
  return [...ids];
}

export async function buildIdentityUserLookupContext(
  source: IdentityActorLookupSource,
  entries: ActorReferencedKnowledge[],
): Promise<IdentityUserLookupContext> {
  const ids = new Set<string>();
  const pairs: Array<{ userId: string; teamId: string }> = [];
  for (const entry of entries) {
    const actorIds = collectIdentityActorIds(entry);
    for (const actorId of actorIds) ids.add(actorId);
    if (entry.teamId) pairs.push(...actorIds.map((userId) => ({ userId, teamId: entry.teamId! })));
  }
  const [users, levels] = await Promise.all([
    source.getUsersByIds([...ids]),
    source.getMembershipLevels(pairs),
  ]);
  return {
    users,
    memberships: pairs.flatMap(({ userId, teamId }) => {
      const securityLevel = levels.get(`${userId}:${teamId}`);
      return securityLevel === undefined ? [] : [{ userId, teamId, securityLevel }];
    }),
  };
}

export async function buildUserLookupContextFromRepos(
  repos: {
    user: { getById(userId: string): Promise<{ id: string; handle: string } | null> };
    membership: {
      findByUserAndTeam(userId: string, teamId: string): Promise<{ securityLevel: number } | null>;
    };
  },
  entries: ActorReferencedKnowledge[],
): Promise<IdentityUserLookupContext> {
  return buildIdentityUserLookupContext(
    {
      async getUsersByIds(userIds) {
        const users = await Promise.all(userIds.map((userId) => repos.user.getById(userId)));
        return users.filter((user): user is { id: string; handle: string } => user !== null);
      },
      async getMembershipLevels(pairs) {
        const levels = new Map<string, number>();
        await Promise.all(
          pairs.map(async ({ userId, teamId }) => {
            const membership = await repos.membership.findByUserAndTeam(userId, teamId);
            if (membership) levels.set(`${userId}:${teamId}`, membership.securityLevel);
          }),
        );
        return levels;
      },
    },
    entries,
  );
}
