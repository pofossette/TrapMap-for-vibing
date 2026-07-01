/**
 * Hashing utilities for deterministic derivation.
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 */

import { createHash } from 'node:crypto';

/**
 * Generate a deterministic SHA-256 content hash from ordered file contents.
 *
 * @param contents - Array of file contents in deterministic order
 * @returns Hex-encoded SHA-256 hash
 */
export function buildContentHash(contents: string[]): string {
  const combined = contents.join('\n\n');
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Generate a deterministic capsule ID from artifact ID, revision, and source hash.
 *
 * @param artifactId - Artifact identifier
 * @param revision - Revision number
 * @param sourceHash - Hash of source content
 * @param index - Capsule index for uniqueness
 * @returns Deterministic capsule ID
 */
export function buildCapsuleId(
  artifactId: string,
  revision: number,
  sourceHash: string,
  index: number,
): string {
  const input = `${artifactId}:${revision}:${sourceHash}:${index}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
