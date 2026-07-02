import {
  type BadcaseEvalDraft,
  badcaseExportResponseSchema,
  buildBadcaseDebugContract,
  buildBadcaseEvalDraft,
  pickWorkflowCorrelation,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { recordRuntimeExecution } from '@trapmap/server/lib/runtime/index.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';

interface BadcaseTraceRow {
  feedback_id: string;
  query_id: string | null;
  query_seed: string | null;
  route_family: 'entry' | 'capsule' | 'graph-plan' | null;
  entry_id: string;
  entry_type: 'trap' | 'skill';
  failure_classification: string | null;
  expected_correction: string | null;
  selected_result_snapshot: Record<string, unknown> | null;
  workflow_stats: Record<string, unknown> | null;
}

function buildDraft(row: BadcaseTraceRow): BadcaseEvalDraft {
  return buildBadcaseEvalDraft({
    feedbackId: row.feedback_id,
    queryId: row.query_id,
    querySeed: row.query_seed,
    routeFamily: row.route_family,
    entryId: row.entry_id,
    entryType: row.entry_type,
    failureClassification: row.failure_classification,
    expectedCorrection: row.expected_correction,
    selectedResultSnapshot: row.selected_result_snapshot,
  });
}

export const badcaseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/badcases/:feedbackId/export', async (request) => {
    const startedAt = Date.now();
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store as { getPool?: () => Pool };
    if (typeof store.getPool !== 'function') {
      throw new AppError(409, 'badcase_export_unavailable', 'Badcase export requires PostgreSQL');
    }

    const feedbackId = (request.params as { feedbackId: string }).feedbackId;
    const pool = store.getPool();
    const asyncJobId = `wf_badcase_${feedbackId}`;
    const result = await pool.query<BadcaseTraceRow>(
      `SELECT trace.feedback_id, trace.query_id, trace.query_seed, trace.route_family, trace.entry_id,
              trace.entry_type, trace.failure_classification, trace.expected_correction,
              trace.selected_result_snapshot, workflow.stats AS workflow_stats
       FROM retrieval_badcase_traces AS trace
       LEFT JOIN workflow_runs AS workflow
         ON workflow.run_id = $2
       WHERE trace.feedback_id = $1
       LIMIT 1`,
      [feedbackId, asyncJobId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, 'badcase_not_found', `Badcase trace not found for ${feedbackId}`);
    }

    const correlation =
      pickWorkflowCorrelation(row.workflow_stats ?? undefined) ??
      pickWorkflowCorrelation({
        feedbackId,
        queryId: row.query_id,
        asyncJobId,
      }) ??
      {};
    const response = badcaseExportResponseSchema.parse({
      feedbackId,
      draft: buildDraft(row),
      debug: buildBadcaseDebugContract({
        correlation,
        sourceFeedbackId: feedbackId,
        queryId: row.query_id,
        routeFamily: row.route_family,
        asyncJobId,
        exportDraftReady:
          row.workflow_stats != null && row.workflow_stats.exportDraftReady === true,
      }),
      exportedAt: nowIso(),
    });
    recordRuntimeExecution({
      dependencyName: 'badcase-export',
      latencyMs: Date.now() - startedAt,
    });
    return response;
  });
};
