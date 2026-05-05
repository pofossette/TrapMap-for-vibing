import type { FastifyPluginAsync } from 'fastify';

import {
  artifactsActivateRoutes,
  artifactsExportRoutes,
  artifactsImportRoutes,
  auditRoutes,
  knowledgeLegacyRoutes,
  migrateRoutes,
  skillEditRoutes,
  skillReviewRoutes,
  statusRoutes,
} from './operations/index.js';

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  // Register all operation sub-routes
  // Order matters: more specific paths should be registered before parameterized ones
  await app.register(auditRoutes);
  await app.register(knowledgeLegacyRoutes);
  await app.register(artifactsExportRoutes);
  await app.register(artifactsImportRoutes);
  await app.register(artifactsActivateRoutes);
  await app.register(migrateRoutes);
  await app.register(statusRoutes);
  await app.register(skillEditRoutes);
  await app.register(skillReviewRoutes);
};
