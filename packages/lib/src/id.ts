/**
 * ID generation helpers: cryptographically-random prefixed IDs.
 */

import { randomUUID } from 'node:crypto';

/**
 * Generate a prefixed ID of the form `<prefix>_<hex-uuid>`.
 *
 * Unified semantics adopted from the `generateId`/`id` helpers previously
 * duplicated across service-knowledge-write (`pg-ports.ts`,
 * `artifact-ports.ts`), service-knowledge-read (`rag-log.ts`),
 * service-governance-review (`pg-ports.ts`, `conflict-workflow.ts`), plus
 * the non-crypto `Math.random().toString(36)` ID generators in
 * service-job-runtime, service-knowledge-write labels and ai-providers.
 *
 * The UUID dashes are stripped; when `maxHexLength` is given the hex body is
 * truncated to that length (the prefix is always preserved).
 */
export function prefixedId(prefix: string, maxHexLength?: number): string {
  const hex = randomUUID().replaceAll('-', '');
  const body = maxHexLength === undefined ? hex : hex.slice(0, maxHexLength);
  return `${prefix}_${body}`;
}
