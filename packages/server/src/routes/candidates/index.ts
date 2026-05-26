/**
 * Candidate routes barrel.
 *
 * Registers all candidate-related sub-route plugins:
 * - Submission: POST /v1/candidates
 * - Query: GET /v1/candidates, GET /v1/candidates/:candidateId
 * - Resolution: POST /v1/candidates/:candidateId/manual-result, POST .../apply-resolution
 * - Duplicates: GET /v1/duplicates, GET /v1/duplicates/:candidateId, GET .../bundle
 */

import type { FastifyPluginAsync } from 'fastify';

import { candidateDuplicateRoutes } from './duplicates.js';
import { candidateQueryRoutes } from './query.js';
import { candidateResolutionRoutes } from './resolution.js';
import { candidateSubmissionRoutes } from './submit.js';

export const candidateRoutes: FastifyPluginAsync = async (app) => {
  await app.register(candidateSubmissionRoutes);
  await app.register(candidateQueryRoutes);
  await app.register(candidateResolutionRoutes);
  await app.register(candidateDuplicateRoutes);
};
