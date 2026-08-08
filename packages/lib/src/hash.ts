/**
 * Hash helpers: SHA-256 digest.
 */

import { createHash } from 'node:crypto';

import type { Sha256Hex } from '@trapmap/contracts';

/**
 * Compute the lowercase hex SHA-256 digest of a Buffer or string.
 *
 * The return value is typed as the shared `Sha256Hex` contract type (64
 * lowercase hex characters, see `sha256HexSchema` in
 * `@trapmap/contracts`), replacing the duplicate implementation that used to
 * live in cli `artifact-bundle.ts`.
 */
export function sha256(input: Buffer | string): Sha256Hex {
  return createHash('sha256').update(input).digest('hex') as Sha256Hex;
}
