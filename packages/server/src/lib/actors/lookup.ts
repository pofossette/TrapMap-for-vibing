/**
 * Actor lookup primitives for repository-backed user handle resolution.
 *
 * Provides a way to build a UserLookupContext from repository calls
 * instead of relying on store.snapshot(). This is the canonical
 * data-access boundary for route/business logic that needs to serialize
 * knowledge entries with user handles and membership levels.
 *
 * Phase: 1 (Establish canonical server data-access boundary)
 */

import type { UserLookupContext } from '@trapmap/server/lib/knowledge.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import type { MembershipRepository } from '@trapmap/server/lib/teams/index.js';
import type { UserRepository } from '@trapmap/server/lib/users/index.js';

/**
 * Source interface for actor data lookups.
 * Abstracts over UserRepository and MembershipRepository so the
 * lookup logic can be tested with stubs.
 */
export interface ActorLookupSource {
  getUsersByIds(userIds: string[]): Promise<Array<{ id: string; handle: string }>>;
  getMembershipLevels(
    pairs: Array<{ userId: string; teamId: string }>,
  ): Promise<Map<string, number>>;
}

/**
 * Collect all unique user IDs referenced in a knowledge record.
 * Covers: owner, revision authors, review decision actors,
 * review note authors, and lifecycle event actors.
 */
export function collectActorIds(record: KnowledgeRecord): string[] {
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

/**
 * Collect all (userId, teamId) pairs that need membership level resolution.
 */
export function collectMembershipPairs(
  record: KnowledgeRecord,
): Array<{ userId: string; teamId: string }> {
  if (!record.teamId) {
    return [];
  }

  const actorIds = collectActorIds(record);
  return actorIds.map((userId) => ({ userId, teamId: record.teamId! }));
}

/**
 * Build a UserLookupContext for a single knowledge record
 * using the provided ActorLookupSource.
 */
export async function buildUserLookupContext(
  source: ActorLookupSource,
  record: KnowledgeRecord,
): Promise<UserLookupContext> {
  const actorIds = collectActorIds(record);
  const pairs = collectMembershipPairs(record);

  const [users, membershipLevels] = await Promise.all([
    source.getUsersByIds(actorIds),
    source.getMembershipLevels(pairs),
  ]);

  const memberships: UserLookupContext['memberships'] = [];
  for (const pair of pairs) {
    const key = `${pair.userId}:${pair.teamId}`;
    const level = membershipLevels.get(key);
    if (level !== undefined) {
      memberships.push({
        userId: pair.userId,
        teamId: pair.teamId,
        securityLevel: level,
      });
    }
  }

  return { users, memberships };
}

/**
 * Build a UserLookupContext for multiple knowledge records
 * using the provided ActorLookupSource.
 */
export async function buildUserLookupContextForKnowledge(
  source: ActorLookupSource,
  entries: KnowledgeRecord[],
): Promise<UserLookupContext> {
  const allActorIds = new Set<string>();
  const allPairs: Array<{ userId: string; teamId: string }> = [];

  for (const entry of entries) {
    for (const id of collectActorIds(entry)) {
      allActorIds.add(id);
    }
    for (const pair of collectMembershipPairs(entry)) {
      allPairs.push(pair);
    }
  }

  const [users, membershipLevels] = await Promise.all([
    source.getUsersByIds([...allActorIds]),
    source.getMembershipLevels(allPairs),
  ]);

  const memberships: UserLookupContext['memberships'] = [];
  for (const pair of allPairs) {
    const key = `${pair.userId}:${pair.teamId}`;
    const level = membershipLevels.get(key);
    if (level !== undefined) {
      memberships.push({
        userId: pair.userId,
        teamId: pair.teamId,
        securityLevel: level,
      });
    }
  }

  return { users, memberships };
}

/**
 * Build an ActorLookupSource from the unified repository object.
 */
function createActorLookupSource(repos: {
  user: UserRepository;
  membership: MembershipRepository;
}): ActorLookupSource {
  return {
    async getUsersByIds(userIds) {
      const users = await Promise.all(userIds.map((id) => repos.user.getById(id)));
      return users
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => ({ id: u.id, handle: u.handle }));
    },

    async getMembershipLevels(pairs) {
      const result = new Map<string, number>();
      const levels = await Promise.all(
        pairs.map(async ({ userId, teamId }) => {
          const membership = await repos.membership.findByUserAndTeam(userId, teamId);
          return { key: `${userId}:${teamId}`, level: membership?.securityLevel };
        }),
      );
      for (const { key, level } of levels) {
        if (level !== undefined) {
          result.set(key, level);
        }
      }
      return result;
    },
  };
}

/**
 * Convenience: build a UserLookupContext from repos for a batch of entries.
 */
export async function buildUserLookupContextFromRepos(
  repos: { user: UserRepository; membership: MembershipRepository },
  entries: KnowledgeRecord[],
): Promise<UserLookupContext> {
  return buildUserLookupContextForKnowledge(createActorLookupSource(repos), entries);
}
