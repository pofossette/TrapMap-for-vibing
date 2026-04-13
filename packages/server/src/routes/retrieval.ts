import type { FastifyPluginAsync } from 'fastify';

import {
  retrievalQuerySchema,
  retrievalResponseSchema,
} from '@skill-shareer/contracts';

import { requirePermission } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { searchKnowledge } from '../lib/retrieval.js';

export const retrievalRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/retrieval/search', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Enforce knowledge:search permission
    requirePermission(auth, 'knowledge:search');

    // Parse and validate query
    const query = retrievalQuerySchema.parse(request.body);

    // Execute retrieval search
    const result = await searchKnowledge(app.skillShareer, auth, query);

    // Validate and return response
    return retrievalResponseSchema.parse(result);
  });
};
