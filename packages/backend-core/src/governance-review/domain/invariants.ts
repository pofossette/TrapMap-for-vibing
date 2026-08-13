/**
 * Governance-review bounded context — feedback invariants.
 *
 * Pure feedback-record invariants for async governance commands with zero
 * framework / DB / I/O imports. The application layer renders these into
 * conflict errors; these predicates are the single source of the matching
 * rules.
 */

export interface RemediationReactivationInvariant {
  entryId: string;
  entryType: string;
}

export interface BadcaseExportInvariant {
  entryId: string;
  entryType: string;
  queryId: string | null;
}

/** Whether a feedback record belongs to a remediation reactivation request. */
export function feedbackMatchesRemediationReactivation(
  record: { entryId: string; entryType?: string },
  payload: RemediationReactivationInvariant,
): boolean {
  return record.entryId === payload.entryId && record.entryType === payload.entryType;
}

/** Whether a feedback record belongs to a badcase export draft request. */
export function feedbackMatchesBadcaseExport(
  record: { entryId: string; entryType?: string; queryId?: string | null },
  payload: BadcaseExportInvariant,
): boolean {
  return (
    record.entryId === payload.entryId &&
    record.entryType === payload.entryType &&
    (record.queryId ?? null) === payload.queryId
  );
}
