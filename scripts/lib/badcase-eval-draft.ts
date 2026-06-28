import { badcaseEvalDraftSchema, buildBadcaseEvalDraft } from '@trapmap/contracts';

export interface BadcaseTraceExportRow {
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

export function buildBadcaseEvalDraftFromTrace(row: BadcaseTraceExportRow) {
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

export function serializeBadcaseEvalDraft(row: BadcaseTraceExportRow): string {
  const draft = badcaseEvalDraftSchema.parse(buildBadcaseEvalDraftFromTrace(row));
  return `${JSON.stringify(draft, null, 2)}\n`;
}
