/**
 * Admin feedback management routes (barrel module).
 *
 * Provides endpoints for the admin feedback review workflow (FEEDBACK-02):
 * - GET /v1/operations/feedback: List feedback queue with filters
 * - POST /v1/operations/feedback/batch: Batch operations (resolve/dismiss/triage/transition)
 * - GET /v1/operations/feedback/stats/:entryId: Quality score for an entry
 * - GET /v1/operations/feedback/remediation: Remediation queue
 * - GET /v1/operations/feedback/remediation/:entryId: Remediation detail
 * - POST /v1/operations/feedback/remediation/:entryId/complete: Complete remediation
 */

import type { FastifyPluginAsync } from 'fastify';

import { registerFeedbackBatchRoute } from './feedback-batch.js';
import { registerFeedbackListRoute } from './feedback-list.js';
import { registerFeedbackStatsRoute } from './feedback-stats.js';
import { registerRemediationRoutes } from './remediation.js';

export const feedbackAdminRoutes: FastifyPluginAsync = async (app) => {
  registerFeedbackListRoute(app);
  registerRemediationRoutes(app);
  registerFeedbackBatchRoute(app);
  registerFeedbackStatsRoute(app);
};
