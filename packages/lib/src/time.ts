/**
 * Time helpers: ISO timestamps and date formatting.
 *
 * These functions consolidate implementations that previously existed in
 * several packages (host-local, service-knowledge-*, service-governance-review,
 * service-identity-access, service-candidate-ingestion, contracts fixtures).
 */

/**
 * Current time as an ISO-8601 UTC string (`new Date().toISOString()`).
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Normalize a timestamp string to ISO-8601.
 *
 * Returns the input unchanged when it cannot be parsed, so legacy/backfill
 * values survive round-trips instead of silently becoming "now".
 * Semantics match the previous `canonicalizeTimestamp` helper in
 * service-knowledge-write (wave9 artifact payload backfill).
 */
export function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Format a date as `YYYY-MM-DD` in local time, for daily log file naming.
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
