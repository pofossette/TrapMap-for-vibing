/**
 * Client transport knobs (timeout + retries) for {@link apiRequest}.
 *
 * Both knobs are OFF by default (= legacy behavior: no timeout, no retries).
 * They are enabled per-request via `RequestOptions` or globally via env:
 * - `TRAPMAP_CLIENT_TIMEOUT_MS`: per-attempt fetch timeout in ms (positive number).
 * - `TRAPMAP_CLIENT_MAX_RETRIES`: extra attempts after the first (non-negative integer).
 *
 * Invalid or absent env values resolve to `undefined`, which keeps the
 * legacy behavior.
 */

/** Env var for the per-attempt fetch timeout in ms. Unset = no timeout (legacy). */
export const CLIENT_TIMEOUT_ENV = 'TRAPMAP_CLIENT_TIMEOUT_MS';
/** Env var for extra retry attempts. Unset = no retries (legacy). */
export const CLIENT_MAX_RETRIES_ENV = 'TRAPMAP_CLIENT_MAX_RETRIES';

/**
 * Resolve the per-attempt fetch timeout in ms.
 * Returns `undefined` when unset or invalid (= no timeout, legacy behavior).
 */
export function resolveClientTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const raw = env[CLIENT_TIMEOUT_ENV];
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Resolve the number of extra retry attempts.
 * Returns `undefined` when unset or invalid (= no retries, legacy behavior).
 */
export function resolveClientMaxRetries(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const raw = env[CLIENT_MAX_RETRIES_ENV];
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}
