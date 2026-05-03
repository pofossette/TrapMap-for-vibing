import type { Permission } from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '../config.js';
import type { AiProviders } from './ai/types.js';
import type { ArtifactRepository } from './artifacts/index.js';
import type { IndexAdapter } from './indexing/types.js';
import type { KnowledgeRepository } from './knowledge/index.js';
import type { MembershipRecord, SkillShareerStore, TeamRecord, UserRecord } from './store.js';

export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  indexAdapters: IndexAdapter[];
  ai: AiProviders;
  /** Knowledge repository for row-level PostgreSQL operations (undefined when using JsonStore) */
  knowledgeRepo: KnowledgeRepository | undefined;
  /** Artifact repository for row-level PostgreSQL operations (undefined when using JsonStore) */
  artifactRepo: ArtifactRepository | undefined;
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
