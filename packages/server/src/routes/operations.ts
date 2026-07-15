import type { FastifyPluginAsync } from 'fastify';

import {
  auditRoutes,
  badcaseRoutes,
  capsuleIndexRoutes,
  knowledgeLegacyRoutes,
  statsRoutes,
  statusRoutes,
} from './operations/index.js';

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  // Register all operation sub-routes
  // Order matters: more specific paths should be registered before parameterized ones
  await app.register(auditRoutes);
  await app.register(badcaseRoutes);
  await app.register(knowledgeLegacyRoutes);
  await app.register(capsuleIndexRoutes);
  await app.register(statusRoutes);
  await app.register(statsRoutes);
};
