import { type BadcaseEvalDraft, badcaseExportResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { recordRuntimeExecution } from '@trapmap/server/lib/runtime/metrics.js';
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
}

function buildDraft(row: BadcaseTraceRow): BadcaseEvalDraft {
  return {
    kind: 'retrieval',
    caseId: `badcase_${row.feedback_id}`,
    sourceFeedbackId: row.feedback_id,
    queryId: row.query_id,
    routeFamily: row.route_family,
    request: {
      queryId: row.query_id,
      querySeed: row.query_seed,
      routeFamily: row.route_family,
      entryId: row.entry_id,
      entryType: row.entry_type,
    },
    expected: {
      failureClassification: row.failure_classification,
      expectedCorrection: row.expected_correction,
      selectedResultSnapshot: row.selected_result_snapshot,
    },
    notes: [
      'Draft generated from retrieval_badcase_traces.',
      'Review expectedCorrection and selectedResultSnapshot before promoting into eval fixtures.',
    ],
  };
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
    const result = await pool.query<BadcaseTraceRow>(
      `SELECT feedback_id, query_id, query_seed, route_family, entry_id, entry_type,
              failure_classification, expected_correction, selected_result_snapshot
       FROM retrieval_badcase_traces
       WHERE feedback_id = $1
       LIMIT 1`,
      [feedbackId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, 'badcase_not_found', `Badcase trace not found for ${feedbackId}`);
    }

    const response = badcaseExportResponseSchema.parse({
      feedbackId,
      draft: buildDraft(row),
      exportedAt: nowIso(),
    });
    recordRuntimeExecution({
      dependencyName: 'badcase-export',
      latencyMs: Date.now() - startedAt,
    });
    return response;
  });
};
