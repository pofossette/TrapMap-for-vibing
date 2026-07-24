import { isDeepStrictEqual } from 'node:util';

import type { ArtifactFilePayloadRecord } from '@trapmap/contracts';
import type { ArtifactFilePayloadOwner } from './artifact-ports.js';

export interface ArtifactFilePayloadBackfillResult {
  migrated: number;
  skipped: number;
  errors: Array<{ artifactId: string; revision: number; path: string; error: string }>;
  verified: number;
}

function canonicalizeTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function matches(left: ArtifactFilePayloadRecord, right: ArtifactFilePayloadRecord): boolean {
  return isDeepStrictEqual(
    { ...left, storedAt: canonicalizeTimestamp(left.storedAt) },
    { ...right, storedAt: canonicalizeTimestamp(right.storedAt) },
  );
}

/** Task 9-only transfer of legacy artifact file content to the artifact owner. */
export async function migrateArtifactFilePayloads(input: {
  owner: ArtifactFilePayloadOwner;
  payloads: readonly ArtifactFilePayloadRecord[];
}): Promise<ArtifactFilePayloadBackfillResult> {
  const result: ArtifactFilePayloadBackfillResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
    verified: 0,
  };
  for (const payload of input.payloads) {
    try {
      const existing = await input.owner.get(payload.artifactId, payload.revision, payload.path);
      if (existing) {
        if (!matches(existing, payload)) {
          result.errors.push({
            artifactId: payload.artifactId,
            revision: payload.revision,
            path: payload.path,
            error: 'destination payload differs from snapshot',
          });
          continue;
        }
        result.skipped += 1;
      } else {
        await input.owner.put(payload);
        result.migrated += 1;
      }
      if (
        matches(
          (await input.owner.get(
            payload.artifactId,
            payload.revision,
            payload.path,
          )) as ArtifactFilePayloadRecord,
          payload,
        )
      )
        result.verified += 1;
    } catch (error) {
      result.errors.push({
        artifactId: payload.artifactId,
        revision: payload.revision,
        path: payload.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
