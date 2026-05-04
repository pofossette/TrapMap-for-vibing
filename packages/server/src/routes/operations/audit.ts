import { auditListResponseSchema, auditQuerySchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent, queryAuditEvents, toAuditEvent } from '../../lib/audit.js';
import { requirePermission } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/audit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'audit:read');

    const query = auditQuerySchema.parse(request.query as Record<string, unknown>);
    const data = await app.skillShareer.store.snapshot();

    const result = queryAuditEvents({
      data,
      query: {
        ...(query.action !== undefined && { action: query.action }),
        ...(query.actorId !== undefined && { actorId: query.actorId }),
        ...(query.entityId !== undefined && { entityId: query.entityId }),
        ...(query.teamId !== undefined && { teamId: query.teamId }),
        ...(query.from !== undefined && { from: query.from }),
        ...(query.to !== undefined && { to: query.to }),
        limit: query.limit,
      },
      auth,
    });

    const items = result.items.map((record) => toAuditEvent(record, data));

    return auditListResponseSchema.parse({
      items,
      nextCursor: null,
      total: result.total,
    });
  });
};
