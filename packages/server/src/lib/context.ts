import type { Permission } from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '../config.js';
import type { AccessKeyRepository } from './auth/index.js';
import type { SessionRepository } from './auth/index.js';
import type { AiProviders } from './ai/types.js';
import type { ArtifactRepository } from './artifacts/index.js';
import type { IndexAdapter } from './indexing/types.js';
import type { KnowledgeRepository } from './knowledge/index.js';
import type { MembershipRepository, TeamRepository } from './teams/index.js';
import type { MembershipRecord, SkillShareerStore, TeamRecord, UserRecord } from './store.js';
import type { UserRepository } from './users/index.js';

export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  indexAdapters: IndexAdapter[];
  ai: AiProviders;
  /** Knowledge repository for row-level PostgreSQL operations (undefined when using JsonStore) */
  knowledgeRepo: KnowledgeRepository | undefined;
  /** Artifact repository for row-level PostgreSQL operations (undefined when using JsonStore) */
  artifactRepo: ArtifactRepository | undefined;
  /** Session repository for auth operations (undefined when using JsonStore) */
  sessionRepo: SessionRepository | undefined;
  /** Access key repository for auth operations (undefined when using JsonStore) */
  accessKeyRepo: AccessKeyRepository | undefined;
  /** User repository for user operations (undefined when using JsonStore) */
  userRepo: UserRepository | undefined;
  /** Team repository for team operations (undefined when using JsonStore) */
  teamRepo: TeamRepository | undefined;
  /** Membership repository for membership operations (undefined when using JsonStore) */
  membershipRepo: MembershipRepository | undefined;
}

export interface ResolvedAuthContext {
  subjectType: 'user' | 'system-admin';
  actorId: string;
  handle: string;
  activeTeamId: string | null;
  securityLevel: number;
  effectivePermissions: Permission[];
  user: UserRecord | null;
  membership: MembershipRecord | null;
  team: TeamRecord | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    skillShareer: SkillShareerServices;
  }

  interface FastifyRequest {
    authContext?: ResolvedAuthContext;
  }
}

export function getSessionToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerToken = request.headers['x-session-token'];
  return typeof headerToken === 'string' ? headerToken.trim() : null;
}
