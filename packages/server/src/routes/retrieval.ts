import type { FastifyPluginAsync } from 'fastify';

import {
  retrievalQuerySchema,
  retrievalResponseSchema,
  retrievalV2QuerySchema,
  retrievalV2ResponseWithHintsSchema,
} from '@trapmap/contracts';

import { requirePermission } from '../lib/rbac.js';
import { searchKnowledge, searchKnowledgeV2 } from '../lib/retrieval.js';
import { resolveAuthContext } from '../lib/session.js';

export const retrievalRoutes: FastifyPluginAsync = async (app) => {
  // Legacy v1 retrieval path (COMP-03)
  // Preserved for backward compatibility during v1.2 migration
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

  // v2 capsule-native retrieval path (RETR-01, RETR-04, COMP-03)
  // Accepts seed-only input and returns capsule-first distilled results
  // Phase 15: Returns activation hints from governed clientManifest (T-15-02)
  app.post('/v2/retrieval/search', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Enforce knowledge:search permission (T-14-10)
    requirePermission(auth, 'knowledge:search');

    // Parse and validate v2 query (seed-only contract)
    const query = retrievalV2QuerySchema.parse(request.body);

    // Execute capsule-native retrieval
    const result = await searchKnowledgeV2(app.skillShareer, auth, query);

    // Validate and return v2 response with activation hints (T-15-03)
    return retrievalV2ResponseWithHintsSchema.parse(result);
  });
};
