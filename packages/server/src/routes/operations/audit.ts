import { auditListResponseSchema, auditQuerySchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildAuditEventProjection } from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission, requireTeamAccess } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/audit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'audit:read');

    const query = auditQuerySchema.parse(request.query as Record<string, unknown>);
    const scopedTeamId =
      query.teamId ??
      (auth.subjectType === 'system-admin' ? undefined : (auth.activeTeamId ?? undefined));
    if (query.teamId !== undefined) {
      requireTeamAccess(auth, query.teamId);
    }

    // Use repository for querying audit events (replaces store.snapshot() + queryAuditEvents())
    const result = await app.skillShareer.identity.auditLog.query({
      ...(query.action !== undefined && { action: query.action }),
      ...(query.actorId !== undefined && { actorId: query.actorId }),
      ...(query.entityId !== undefined && { entityId: query.entityId }),
      ...(scopedTeamId !== undefined && { teamId: scopedTeamId }),
      ...(query.requestId !== undefined && { requestId: query.requestId }),
      ...(query.traceId !== undefined && { traceId: query.traceId }),
      ...(query.operationId !== undefined && { operationId: query.operationId }),
      ...(query.causationId !== undefined && { causationId: query.causationId }),
      ...(query.from !== undefined && { from: query.from }),
      ...(query.to !== undefined && { to: query.to }),
      limit: query.limit,
    });

    const items = await buildAuditEventProjection(
      app.skillShareer.identity.actorLookup,
      result.items,
    );

    return auditListResponseSchema.parse({
      items,
      nextCursor: null,
      total: result.total,
    });
  });
};
