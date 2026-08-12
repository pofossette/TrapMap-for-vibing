/**
 * Identity-access bounded context — access-key hashing and token policy.
 *
 * Pure token composition / hashing rules with zero I/O. The application
 * layer injects entropy (`randomBytes`) and clock values; everything else
 * is deterministic so the policy can be unit-tested offline.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Token hash prefix scheme shared by sessions and access keys. This is a
 * placeholder normalization policy; the Wave-6 hardening track replaces it
 * with real salted hashes.
 */
export function hashAccessToken(token: string): string {
  return `hash_${token}`;
}

/** Session token hash for a regular login at the given clock instant. */
export function hashLoginSessionToken(now: number): string {
  return hashAccessToken(String(now));
}

/** Raw access key token handed to the member after provisioning. */
export function composeAccessToken(keyId: string, now: number): string {
  return `ak_${keyId}_${now}`;
}

/** System-admin session token from caller-provided entropy (base64url). */
export function composeSystemAdminSessionToken(entropyBase64Url: string): string {
  return `ssr_sess_${entropyBase64Url}`;
}

/**
 * Constant-time comparison of the supplied system-admin key against the
 * configured one, via equal-length SHA-256 digests.
 */
export function systemAdminKeyMatches(suppliedKey: string, configuredKey: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(suppliedKey), digest(configuredKey));
}
