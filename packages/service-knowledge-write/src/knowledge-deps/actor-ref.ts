import { AppError } from './errors.js';

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

export function toActorRef(
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
