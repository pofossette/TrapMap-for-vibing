import { auditListResponseSchema, auditQuerySchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildAuditEventProjection } from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/audit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'audit:read');

    const query = auditQuerySchema.parse(request.query as Record<string, unknown>);

    // Use repository for querying audit events (replaces store.snapshot() + queryAuditEvents())
    const { audit: auditRepo } = app.skillShareer.repos;
    const result = await auditRepo.listByFilter({
      ...(query.action !== undefined && { action: query.action }),
      ...(query.actorId !== undefined && { actorId: query.actorId }),
      ...(query.entityId !== undefined && { entityId: query.entityId }),
      ...(query.teamId !== undefined && { teamId: query.teamId }),
      ...(query.from !== undefined && { from: query.from }),
      ...(query.to !== undefined && { to: query.to }),
      limit: query.limit,
    });

    const items = await buildAuditEventProjection(app.skillShareer.repos, result.items);

    return auditListResponseSchema.parse({
      items,
      nextCursor: null,
      total: result.total,
    });
  });
};
