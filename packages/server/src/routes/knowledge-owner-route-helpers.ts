import { knowledgeHistoryResponseSchema, knowledgeSubmissionSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { normalizeKnowledgeOwnerEntry } from './knowledge-owner-response.js';

type RouteApp = Parameters<FastifyPluginAsync>[0];
type SubmissionKind = 'knowledge' | 'trap';

export function requireRealUser(userId: string | undefined): string {
  if (!userId) {
    throw new AppError(
      403,
      'user_required',
      'This workflow requires a real member account instead of the virtual system admin',
    );
  }
  return userId;
}

export async function resolveOwnerSubmission(
  app: RouteApp,
  request: FastifyRequest,
  kind: SubmissionKind,
): Promise<{
  auth: ResolvedAuthContext;
  payload: ReturnType<typeof knowledgeSubmissionSchema.parse>;
  ownerUserId: string;
}> {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:submit');
  const payload = knowledgeSubmissionSchema.parse(request.body);
  const ownerUserId = requireRealUser(auth.user?.id);
  if (payload.scope === 'project' && !auth.activeTeamId) {
    throw new AppError(
      400,
      'active_team_required',
      `Project-scoped ${kind} requires an active team`,
    );
  }
  if (payload.requiredLevel !== undefined && payload.requiredLevel > auth.securityLevel) {
    throw new AppError(
      403,
      'required_level_too_high',
      'requiredLevel cannot exceed the submitter security level',
    );
  }
  return { auth, payload, ownerUserId };
}

export async function listOwnedKnowledgeHistory(app: RouteApp, request: FastifyRequest) {
  const auth = await resolveAuthContext(app.skillShareer, request);
  const entries = await app.skillShareer.knowledgeOwner.listByFilter({
    ownerUserId: requireRealUser(auth.user?.id),
  });
  return knowledgeHistoryResponseSchema.parse({
    items: entries.map((entry) => normalizeKnowledgeOwnerEntry(entry)),
  });
}
